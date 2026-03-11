from __future__ import annotations

"""
EL AL Cargo Tracking - browserless "mock browser" flow.

Primary flow:
1) Query Track-Trace (server rendered endpoint)
2) Extract carrier metadata and direct tracking URL
3) Attempt direct carrier fetch using curl_cffi browser impersonation
"""
import argparse
import json
import os
import re
import select
import sys
import time
from typing import List, Optional, Tuple

from bs4 import BeautifulSoup

try:
    from curl_cffi import requests as curl_requests
except ImportError:
    curl_requests = None

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sync_playwright = None

import requests


TRACKTRACE_URL = "https://www.track-trace.com/aircargo"
DEFAULT_COOKIE_FILE = ".elal_cookies.json"


def parse_awb(raw_awb: str, prefix_override: Optional[str]) -> Tuple[str, str]:
    awb = raw_awb.strip().replace("-", "").replace(" ", "")
    if len(awb) == 11 and awb.isdigit():
        return awb[:3], awb[3:]
    if len(awb) == 8 and awb.isdigit():
        return (prefix_override or "114"), awb
    raise ValueError("Invalid AWB. Use 11 digits or 8-digit serial with --prefix")


def extract_tracking_data(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    data = {
        "awb": None,
        "status": None,
        "origin": None,
        "destination": None,
        "flight": None,
        "events": [],
    }

    for tag in soup(["script", "style"]):
        tag.decompose()

    text = soup.get_text(separator=" ", strip=True)

    patterns = {
        "awb": r"(?:AWB|Air\s*Waybill|Waybill)[:\s#]*(\d{3}[-]?\d{8})",
        "status": r"(?:Status|State)[:\s]+([A-Za-z\s]+?)(?:\n|$|,)",
        "origin": r"(?:Origin|From)[:\s]+([A-Z]{3}|[A-Za-z\s,]+?)(?:\n|$|\.)",
        "destination": r"(?:Destination|To)[:\s]+([A-Z]{3}|[A-Za-z\s,]+?)(?:\n|$|\.)",
        "flight": r"(?:Flight|FLT)[:\s#]*([A-Z0-9]{2}\s*\d+)",
    }
    for key, pattern in patterns.items():
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            data[key] = match.group(1).strip()

    tables = soup.find_all("table")
    for table in tables:
        rows = table.find_all("tr")
        if len(rows) < 1:
            continue
        headers = [cell.get_text(strip=True) for cell in rows[0].find_all(["th", "td"])]
        headers = [h for h in headers if h]
        use_generic = not headers
        for row in rows[1:]:
            cells = [cell.get_text(strip=True) for cell in row.find_all(["td", "th"])]
            cells = [c for c in cells if c]
            if not cells:
                continue
            if use_generic:
                data["events"].append({"Details": " | ".join(cells)})
            else:
                col_count = min(len(headers), len(cells))
                data["events"].append(dict(zip(headers[:col_count], cells[:col_count])))

        # Single-row tables can still carry useful details.
        if len(rows) == 1:
            cells = [cell.get_text(strip=True) for cell in rows[0].find_all(["td", "th"])]
            cells = [c for c in cells if c]
            if cells:
                data["events"].append({"Details": " | ".join(cells)})

    return data


def is_antibot_html(html: str) -> bool:
    lower = html.lower()
    patterns = [
        "kramericaindustries",
        "window.rbzns",
        "winsocks();",
        "aka_a2",
        "bot manager",
        "access denied",
    ]
    return any(p in lower for p in patterns)


def extract_generic_text_payload(html: str, max_chars: int = 1200) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    text = soup.get_text(" ", strip=True)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


def build_html_snippets(html: str, max_chars: int = 1800) -> str:
    """Return compact, human-readable snippets from HTML for debugging."""
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(" ", strip=True)
    text = re.sub(r"\s+", " ", text).strip()

    markers = []
    checks = {
        "has_iframe": r"<iframe",
        "has_table": r"<table",
        "has_awb_mention": r"\bAWB\b|air\s*waybill",
        "has_status_word": r"\bstatus\b",
        "has_flight_word": r"\bflight\b",
        "anti_bot_kramerica": r"kramericaindustries",
        "service_unavailable": r"service unavailable|error page|access denied",
    }
    lower_html = html.lower()
    for key, pattern in checks.items():
        markers.append(f"{key}={bool(re.search(pattern, lower_html, re.IGNORECASE))}")

    snippet_lines = [
        "Markers: " + ", ".join(markers),
        f"Text snippet ({min(len(text), max_chars)} chars):",
        text[:max_chars] if text else "(no visible text extracted)",
    ]
    return "\n".join(snippet_lines)


def wait_for_enter_or_timeout(seconds: int) -> None:
    """Wait for Enter key or timeout, whichever comes first."""
    if seconds <= 0:
        return
    try:
        if sys.stdin and sys.stdin.isatty():
            ready, _, _ = select.select([sys.stdin], [], [], seconds)
            if ready:
                sys.stdin.readline()
            return
    except Exception:
        pass
    time.sleep(seconds)


def build_cookie_header_from_playwright_cookies(cookies: List[dict], host_contains: str) -> str:
    parts: List[str] = []
    for c in cookies:
        domain = c.get("domain", "")
        if host_contains in domain:
            name = c.get("name")
            value = c.get("value")
            if name and value is not None:
                parts.append(f"{name}={value}")
    return "; ".join(parts)


def collect_page_and_frame_html(page) -> List[str]:
    """Collect HTML from main page and all accessible frames."""
    html_candidates: List[str] = []
    try:
        html_candidates.append(page.content())
    except Exception:
        pass
    try:
        for fr in page.frames:
            try:
                body = fr.content()
                if body:
                    html_candidates.append(body)
            except Exception:
                continue
    except Exception:
        pass
    # De-duplicate while keeping order
    dedup: List[str] = []
    seen = set()
    for h in html_candidates:
        if h in seen:
            continue
        seen.add(h)
        dedup.append(h)
    return dedup


def parse_first_structured_candidate(html_candidates: List[str]) -> Tuple[bool, str, str]:
    """
    Parse first HTML candidate containing structured tracking data.
    Returns (ok, message, chosen_html).
    """
    for body in sorted(html_candidates, key=len, reverse=True):
        if is_antibot_html(body):
            continue
        parsed = extract_tracking_data(body)
        if any([parsed["status"], parsed["origin"], parsed["destination"], parsed["flight"], parsed["events"]]):
            lines = ["[+] Structured tracking data extracted."]
            if parsed["status"]:
                lines.append(f"Status: {parsed['status']}")
            if parsed["origin"]:
                lines.append(f"Origin: {parsed['origin']}")
            if parsed["destination"]:
                lines.append(f"Destination: {parsed['destination']}")
            if parsed["flight"]:
                lines.append(f"Flight: {parsed['flight']}")
            if parsed["events"]:
                lines.append(f"Events: {len(parsed['events'])}")
            return True, "\n".join(lines), body

        # Fallback success criterion: substantial non-challenge readable text.
        payload = extract_generic_text_payload(body)
        if len(payload) >= 250:
            return True, "[+] Extracted readable tracking page payload.", body
    return False, "No structured tracking fields found in any frame/page candidate.", ""


def build_clean_trace_output(
    awb: str,
    carrier: Optional[str],
    direct_url: Optional[str],
    source: str,
    html: str,
    provider_origin: Optional[str] = None,
    reason: str = "",
) -> dict:
    parsed = extract_tracking_data(html) if html else {
        "awb": None, "status": None, "origin": None, "destination": None, "flight": None, "events": []
    }
    origin_value = parsed.get("origin") or provider_origin
    has_data = any([parsed.get("status"), origin_value, parsed.get("destination"), parsed.get("flight"), parsed.get("events")])
    return {
        "awb": awb,
        "carrier": carrier,
        "direct_url": direct_url,
        "source": source,
        "data_available": bool(has_data),
        "status": parsed.get("status"),
        "origin": origin_value,
        "destination": parsed.get("destination"),
        "flight": parsed.get("flight"),
        "events": parsed.get("events", []),
        "reason": reason,
    }


def save_cookie_payload(cookie_file: str, cookie_header: str, cookies: List[dict]) -> None:
    payload = {
        "cookie_header": cookie_header,
        "cookies": cookies,
        "saved_at": int(time.time()),
    }
    with open(cookie_file, "w", encoding="utf-8") as out:
        json.dump(payload, out, indent=2)


def load_cookie_header(cookie_file: str) -> str:
    if not cookie_file or not os.path.exists(cookie_file):
        return ""
    try:
        with open(cookie_file, "r", encoding="utf-8") as inp:
            data = json.load(inp)
        return data.get("cookie_header", "") if isinstance(data, dict) else ""
    except Exception:
        return ""


def track_via_tracktrace(full_awb: str, debug: bool) -> Tuple[dict, Optional[str]]:
    response = requests.post(
        TRACKTRACE_URL,
        data={"number": full_awb, "config": "205200", "commit": "Track with options"},
        timeout=30,
    )
    response.raise_for_status()
    html = response.text

    if debug:
        with open("tracktrace_response.html", "w", encoding="utf-8") as out:
            out.write(html)
        print("[*] Saved tracktrace_response.html")

    soup = BeautifulSoup(html, "html.parser")

    result = {
        "provider": "track-trace",
        "awb": full_awb,
        "origin": None,
        "carrier": None,
        "direct_url": None,
    }

    # "Origin: El Al Israel Airlines(LY)" (may include nested tags)
    origin_div = None
    for div in soup.select("div.navbar-item"):
        txt = div.get_text(" ", strip=True)
        if re.search(r"\bOrigin\s*:", txt, re.IGNORECASE):
            origin_div = div
            break
    if origin_div:
        text = origin_div.get_text(" ", strip=True)
        result["origin"] = re.sub(r"^\s*Origin\s*:\s*", "", text, flags=re.IGNORECASE).strip()

    carrier_link = soup.select_one("div.navbar-item a[href]")
    if carrier_link:
        result["carrier"] = carrier_link.get_text(strip=True)

    iframe = soup.select_one("iframe.track_res_frame")
    if iframe and iframe.get("src"):
        result["direct_url"] = iframe.get("src")

    # Fallback: use track_form endpoint to get the direct URL.
    if not result["direct_url"]:
        tf = requests.post(
            f"{TRACKTRACE_URL}/track_form",
            data={"number": full_awb, "config": "205200"},
            timeout=30,
        )
        tf.raise_for_status()
        m = re.search(r'<div id="direct-form">(.*?)</div>', tf.text, re.IGNORECASE | re.DOTALL)
        if m:
            result["direct_url"] = BeautifulSoup(m.group(1), "html.parser").get_text(strip=True)

    return result, html


def fetch_direct_with_mock_browser(
    direct_url: str,
    debug: bool,
    cookie_header: str = "",
) -> Tuple[bool, str, bool, str]:
    if curl_requests is None:
        return False, "curl_cffi is not installed. Run: pip install curl_cffi", False, ""

    headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://www.track-trace.com/",
    }
    if cookie_header:
        headers["Cookie"] = cookie_header

    try:
        r = curl_requests.get(direct_url, impersonate="chrome124", timeout=30, headers=headers)
    except Exception as exc:
        return False, f"Direct fetch failed: {exc}", False, ""

    if debug:
        with open("direct_response.html", "w", encoding="utf-8") as out:
            out.write(r.text)
        print("[*] Saved direct_response.html")

    anti_bot = is_antibot_html(r.text) or r.status_code in (247, 403)
    if anti_bot:
        return False, f"Carrier anti-bot challenge detected (status {r.status_code}).", True, r.text

    parsed = extract_tracking_data(r.text)
    if any([parsed["status"], parsed["origin"], parsed["destination"], parsed["flight"], parsed["events"]]):
        lines = ["[+] Direct carrier fetch succeeded."]
        if parsed["status"]:
            lines.append(f"Status: {parsed['status']}")
        if parsed["origin"]:
            lines.append(f"Origin: {parsed['origin']}")
        if parsed["destination"]:
            lines.append(f"Destination: {parsed['destination']}")
        if parsed["flight"]:
            lines.append(f"Flight: {parsed['flight']}")
        if parsed["events"]:
            lines.append(f"Events: {len(parsed['events'])}")
        return True, "\n".join(lines), False, r.text

    payload = extract_generic_text_payload(r.text)
    if len(payload) >= 250:
        return True, "[+] Direct carrier fetch returned readable content payload.", False, r.text

    return False, "Direct carrier page loaded but no extractable tracking payload was found.", False, r.text


def fetch_with_playwright_fallback(
    awb_prefix: str,
    awb_serial: str,
    direct_url: str,
    debug: bool,
    headed: bool = False,
) -> Tuple[bool, str, str]:
    if sync_playwright is None:
        return False, "Playwright is not installed. Run: pip install playwright"

    online_tracking_url = "https://www.elal.com/en/Cargo/Pages/Online-Tracking.aspx"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=not headed)
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1280, "height": 720},
            )
            page = context.new_page()
            page.goto(online_tracking_url, wait_until="load", timeout=30000)

            iframe_el = page.query_selector('iframe[src*="AIR2.aspx"]')
            tracking_frame = iframe_el.content_frame() if iframe_el else None
            if not tracking_frame:
                browser.close()
                return False, "Playwright fallback failed: AIR2 iframe not found."

            tracking_frame.fill("#AWBID", awb_prefix)
            tracking_frame.fill("#AWBNumber", awb_serial)

            html = ""
            html_candidates: List[str] = []
            try:
                with context.expect_page(timeout=10000) as popup_info:
                    tracking_frame.click("#ImageButton1", timeout=5000)
                popup_page = popup_info.value
                popup_page.wait_for_timeout(8000)
                html = popup_page.content()
                html_candidates.extend(collect_page_and_frame_html(popup_page))
                popup_page.close()
            except Exception:
                results_page = context.new_page()
                results_page.goto(direct_url, wait_until="networkidle", timeout=20000)
                results_page.wait_for_timeout(8000)
                html = results_page.content()
                html_candidates.extend(collect_page_and_frame_html(results_page))
                results_page.close()

            browser.close()

        if debug:
            with open("playwright_response.html", "w", encoding="utf-8") as out:
                out.write(html)
            print("[*] Saved playwright_response.html")

        ok, msg, chosen = parse_first_structured_candidate(html_candidates or [html])
        if ok:
            return True, "[+] Playwright fallback succeeded.\n" + msg, chosen

        return False, "Playwright fallback ran, but no structured tracking data was extracted.", html
    except Exception as exc:
        return False, f"Playwright fallback failed: {exc}", ""


def fetch_with_manual_challenge_mode(
    direct_url: str,
    debug: bool,
    user_data_dir: str,
    wait_seconds: int,
    cookie_file: str,
) -> Tuple[bool, str, str]:
    """
    Open a persistent headed browser and let user solve anti-bot challenge.
    After user confirms, attempt to extract tracking data from page/network responses.
    """
    if sync_playwright is None:
        return False, "Playwright is not installed. Run: pip install playwright", ""

    captured_payloads: List[str] = []
    try:
        with sync_playwright() as p:
            os.makedirs(user_data_dir, exist_ok=True)
            context = p.chromium.launch_persistent_context(
                user_data_dir=user_data_dir,
                headless=False,
                viewport={"width": 1280, "height": 720},
            )

            page = context.new_page()

            def handle_response(resp):
                try:
                    # Capture aggressively: some providers return data with unusual content-types.
                    body = ""
                    try:
                        body = resp.text()
                    except Exception:
                        try:
                            body = resp.body().decode("utf-8", errors="ignore")
                        except Exception:
                            body = ""
                    if body and len(body) > 80:
                        captured_payloads.append(body)
                except Exception:
                    return

            page.on("response", handle_response)
            page.goto(direct_url, wait_until="domcontentloaded", timeout=45000)

            print("[*] Manual mode: solve any challenge in the opened browser window.")
            print(
                f"[*] Press Enter to continue, or wait {wait_seconds}s for auto-continue."
            )
            wait_for_enter_or_timeout(wait_seconds)

            # Allow late XHR/frame responses to arrive after manual interaction.
            page.wait_for_timeout(7000)
            html = page.content()
            html_candidates = collect_page_and_frame_html(page)
            cookies = context.cookies()
            cookie_header = build_cookie_header_from_playwright_cookies(cookies, "elalextra.net")
            if cookie_header:
                save_cookie_payload(cookie_file, cookie_header, cookies)
                print(f"[*] Saved cookies to {cookie_file}")

            if debug:
                with open("manual_mode_response.html", "w", encoding="utf-8") as out:
                    out.write(html)
                print("[*] Saved manual_mode_response.html")

            ok1, msg1, chosen1 = parse_first_structured_candidate(html_candidates or [html])
            if ok1:
                context.close()
                return True, "[+] Manual challenge mode succeeded (page/frame content).\n" + msg1, chosen1

            # Try a fresh browserless call using saved cookies.
            if cookie_header:
                ok2, msg2, anti2, html2 = fetch_direct_with_mock_browser(
                    direct_url,
                    debug=debug,
                    cookie_header=cookie_header,
                )
                if ok2:
                    context.close()
                    return True, "[+] Manual mode cookie replay succeeded.\n" + msg2, html2
                if not anti2 and html2:
                    context.close()
                    return False, "Cookie replay ran but no structured data found.", html2

            # If DOM parse fails, inspect captured network responses.
            for body in sorted(captured_payloads, key=len, reverse=True):
                parsed = extract_tracking_data(body)
                if any([parsed["status"], parsed["origin"], parsed["destination"], parsed["flight"], parsed["events"]]):
                    lines = ["[+] Manual challenge mode succeeded (network response)."]
                    if parsed["status"]:
                        lines.append(f"Status: {parsed['status']}")
                    if parsed["origin"]:
                        lines.append(f"Origin: {parsed['origin']}")
                    if parsed["destination"]:
                        lines.append(f"Destination: {parsed['destination']}")
                    if parsed["flight"]:
                        lines.append(f"Flight: {parsed['flight']}")
                    if parsed["events"]:
                        lines.append(f"Events: {len(parsed['events'])}")
                    context.close()
                    return True, "\n".join(lines), body

            ok3, msg3, chosen3 = parse_first_structured_candidate(captured_payloads)
            if ok3:
                context.close()
                return True, "[+] Manual challenge mode succeeded (generic network payload).\n" + msg3, chosen3

            context.close()
            return (
                False,
                "Manual challenge mode finished, but structured data was still not extracted.",
                html,
            )
    except Exception as exc:
        return False, f"Manual challenge mode failed: {exc}", ""


def run(
    awb: str,
    prefix: Optional[str],
    debug: bool,
    browser_fallback: bool = True,
    headed_fallback: bool = False,
    dump_snippets: bool = False,
    manual_challenge: bool = False,
    manual_wait_seconds: int = 60,
    manual_user_data_dir: str = ".elal-browser-profile",
    cookie_file: str = DEFAULT_COOKIE_FILE,
    cookie_header: str = "",
) -> bool:
    awb_prefix, awb_serial = parse_awb(awb, prefix)
    full_awb = f"{awb_prefix}-{awb_serial}"

    print("[*] Browserless mode (mock browser via HTTP impersonation)")
    print(f"[*] AWB: {full_awb}")

    result, provider_html = track_via_tracktrace(full_awb, debug)
    print("[+] Track-Trace query succeeded")
    if result["origin"]:
        print(f"Origin (provider): {result['origin']}")
    if result["carrier"]:
        print(f"Carrier (provider): {result['carrier']}")
    if result["direct_url"]:
        print(f"Direct URL: {result['direct_url']}")

    if not result["direct_url"]:
        print("[-] Could not extract direct carrier URL.")
        clean = build_clean_trace_output(
            awb=full_awb,
            carrier=result.get("carrier"),
            direct_url=result.get("direct_url"),
            source="provider",
            html=provider_html or "",
            provider_origin=result.get("origin"),
            reason="direct_url_not_found",
        )
        print("\n===== CLEAN_AWB_TRACE_JSON =====")
        print(json.dumps(clean, indent=2, ensure_ascii=False))
        print("================================")
        return False

    chosen_source = "direct"
    chosen_html = ""
    chosen_reason = ""

    effective_cookie_header = cookie_header or load_cookie_header(cookie_file)
    if effective_cookie_header:
        print("[*] Using saved cookie header for direct fetch.")
    ok, message, anti_bot, direct_html = fetch_direct_with_mock_browser(
        result["direct_url"],
        debug,
        cookie_header=effective_cookie_header,
    )
    print(message)
    chosen_html = direct_html
    chosen_reason = message
    if not ok and anti_bot and browser_fallback:
        print("[*] Trying Playwright fallback...")
        pw_ok, pw_message, pw_html = fetch_with_playwright_fallback(
            awb_prefix,
            awb_serial,
            result["direct_url"],
            debug,
            headed=headed_fallback,
        )
        print(pw_message)
        if pw_ok:
            chosen_source = "playwright_fallback"
            chosen_html = pw_html
            chosen_reason = pw_message
            clean = build_clean_trace_output(
                awb=full_awb,
                carrier=result.get("carrier"),
                direct_url=result.get("direct_url"),
                source=chosen_source,
                html=chosen_html,
                provider_origin=result.get("origin"),
                reason=chosen_reason,
            )
            print("\n===== CLEAN_AWB_TRACE_JSON =====")
            print(json.dumps(clean, indent=2, ensure_ascii=False))
            print("================================")
            return True
        if dump_snippets and pw_html:
            print("\n--- Playwright fallback snippets ---")
            print(build_html_snippets(pw_html))

    if not ok and anti_bot and manual_challenge:
        print("[*] Trying manual challenge mode...")
        manual_ok, manual_message, manual_html = fetch_with_manual_challenge_mode(
            result["direct_url"],
            debug=debug,
            user_data_dir=manual_user_data_dir,
            wait_seconds=manual_wait_seconds,
            cookie_file=cookie_file,
        )
        print(manual_message)
        if manual_ok:
            chosen_source = "manual_challenge_mode"
            chosen_html = manual_html
            chosen_reason = manual_message
            clean = build_clean_trace_output(
                awb=full_awb,
                carrier=result.get("carrier"),
                direct_url=result.get("direct_url"),
                source=chosen_source,
                html=chosen_html,
                provider_origin=result.get("origin"),
                reason=chosen_reason,
            )
            print("\n===== CLEAN_AWB_TRACE_JSON =====")
            print(json.dumps(clean, indent=2, ensure_ascii=False))
            print("================================")
            return True
        if dump_snippets and manual_html:
            print("\n--- Manual challenge snippets ---")
            print(build_html_snippets(manual_html))

    if not ok:
        if dump_snippets:
            if direct_html:
                print("\n--- Direct carrier response snippets ---")
                print(build_html_snippets(direct_html))
            if provider_html:
                print("\n--- Track-Trace provider snippets ---")
                print(build_html_snippets(provider_html))
        print("[*] Workaround: use the direct URL above in a regular browser session.")

    final_reason = chosen_reason or "no_structured_data_extracted"
    if anti_bot:
        final_reason = f"{final_reason} | anti_bot_detected"
    clean = build_clean_trace_output(
        awb=full_awb,
        carrier=result.get("carrier"),
        direct_url=result.get("direct_url"),
        source=chosen_source,
        html=chosen_html,
        provider_origin=result.get("origin"),
        reason=final_reason,
    )
    print("\n===== CLEAN_AWB_TRACE_JSON =====")
    print(json.dumps(clean, indent=2, ensure_ascii=False))
    print("================================")
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Query EL AL Cargo Tracking (hybrid mode)")
    parser.add_argument("awb", nargs="?", default="11463866703", help="11-digit AWB or 8-digit serial")
    parser.add_argument("--prefix", help="AWB prefix when using 8-digit serial")
    parser.add_argument("--debug", action="store_true", help="Save provider/direct HTML responses")
    parser.add_argument(
        "--no-browser-fallback",
        action="store_true",
        help="Disable Playwright fallback if anti-bot is detected",
    )
    parser.add_argument(
        "--headed-fallback",
        action="store_true",
        help="Run Playwright fallback in visible browser mode",
    )
    parser.add_argument(
        "--dump-snippets",
        action="store_true",
        help="Print raw text/key HTML markers when structured parsing fails",
    )
    parser.add_argument(
        "--manual-challenge",
        action="store_true",
        help="Open persistent headed browser for manual anti-bot solve, then parse results",
    )
    parser.add_argument(
        "--manual-wait-seconds",
        type=int,
        default=60,
        help="Used in non-interactive terminals before scraping manual mode page",
    )
    parser.add_argument(
        "--manual-user-data-dir",
        default=".elal-browser-profile",
        help="Persistent browser profile directory for manual challenge mode",
    )
    parser.add_argument(
        "--cookie-file",
        default=DEFAULT_COOKIE_FILE,
        help="Cookie JSON file used for browserless direct fetch replay",
    )
    parser.add_argument(
        "--cookie-header",
        default="",
        help="Optional raw Cookie header for direct carrier fetch",
    )
    args = parser.parse_args()

    try:
        success = run(
            args.awb,
            args.prefix,
            args.debug,
            browser_fallback=not args.no_browser_fallback,
            headed_fallback=args.headed_fallback,
            dump_snippets=args.dump_snippets,
            manual_challenge=args.manual_challenge,
            manual_wait_seconds=args.manual_wait_seconds,
            manual_user_data_dir=args.manual_user_data_dir,
            cookie_file=args.cookie_file,
            cookie_header=args.cookie_header,
        )
    except ValueError as exc:
        print(f"[-] {exc}")
        sys.exit(1)
    except requests.RequestException as exc:
        print(f"[-] Network error: {exc}")
        sys.exit(1)

    sys.exit(0 if success else 1)
