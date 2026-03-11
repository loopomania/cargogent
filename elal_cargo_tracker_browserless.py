from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Dict, Optional, Tuple

import requests
from bs4 import BeautifulSoup

try:
    from curl_cffi import requests as curl_requests
except ImportError:
    curl_requests = None


TRACKTRACE_URL = "https://www.track-trace.com/aircargo"


def parse_awb(raw_awb: str, prefix_override: Optional[str]) -> Tuple[str, str]:
    awb = raw_awb.strip().replace("-", "").replace(" ", "")
    if len(awb) == 11 and awb.isdigit():
        return awb[:3], awb[3:]
    if len(awb) == 8 and awb.isdigit():
        return (prefix_override or "114"), awb
    raise ValueError("Invalid AWB. Use 11 digits or 8-digit serial with --prefix")


def is_antibot_html(html: str, status_code: int) -> bool:
    lower = (html or "").lower()
    signals = ["kramericaindustries", "window.rbzns", "winsocks();", "aka_a2", "access denied"]
    return status_code in (247, 403) or any(s in lower for s in signals)


def extract_tracking_data(html: str) -> Dict:
    soup = BeautifulSoup(html or "", "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    text = re.sub(r"\s+", " ", soup.get_text(" ", strip=True)).strip()
    data = {
        "status": None,
        "origin": None,
        "destination": None,
        "flight": None,
        "events": [],
    }

    patterns = {
        "status": r"(?:Status|State)[:\s]+([A-Za-z0-9\s\-_/]+?)(?:\n|$|,)",
        "origin": r"(?:Origin|From)[:\s]+([A-Za-z0-9\s\-\(\)/]+?)(?:\n|$|,|\.)",
        "destination": r"(?:Destination|To)[:\s]+([A-Za-z0-9\s\-\(\)/]+?)(?:\n|$|,|\.)",
        "flight": r"(?:Flight|FLT)[:\s#]*([A-Z0-9]{2}\s*\d+)",
    }
    for key, pattern in patterns.items():
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            data[key] = m.group(1).strip()

    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if not rows:
            continue
        headers = [c.get_text(strip=True) for c in rows[0].find_all(["th", "td"])]
        headers = [h for h in headers if h]
        for row in rows[1:] if len(rows) > 1 else rows:
            cells = [c.get_text(strip=True) for c in row.find_all(["td", "th"])]
            cells = [c for c in cells if c]
            if not cells:
                continue
            if headers:
                n = min(len(headers), len(cells))
                data["events"].append(dict(zip(headers[:n], cells[:n])))
            else:
                data["events"].append({"Details": " | ".join(cells)})

    return data


def track_via_provider(full_awb: str) -> Dict:
    r = requests.post(
        TRACKTRACE_URL,
        data={"number": full_awb, "config": "205200", "commit": "Track with options"},
        timeout=30,
    )
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    origin = None
    for div in soup.select("div.navbar-item"):
        txt = div.get_text(" ", strip=True)
        if re.search(r"\bOrigin\s*:", txt, re.IGNORECASE):
            origin = re.sub(r"^\s*Origin\s*:\s*", "", txt, flags=re.IGNORECASE).strip()
            break

    carrier = None
    carrier_link = soup.select_one("div.navbar-item a[href]")
    if carrier_link:
        carrier = carrier_link.get_text(strip=True)

    direct_url = None
    iframe = soup.select_one("iframe.track_res_frame")
    if iframe and iframe.get("src"):
        direct_url = iframe.get("src")

    if not direct_url:
        tf = requests.post(
            f"{TRACKTRACE_URL}/track_form",
            data={"number": full_awb, "config": "205200"},
            timeout=30,
        )
        tf.raise_for_status()
        m = re.search(r'<div id="direct-form">(.*?)</div>', tf.text, re.IGNORECASE | re.DOTALL)
        if m:
            direct_url = BeautifulSoup(m.group(1), "html.parser").get_text(strip=True)

    return {
        "origin": origin,
        "carrier": carrier,
        "direct_url": direct_url,
        "provider_html": r.text,
    }


def fetch_direct_browserless(direct_url: str) -> Tuple[int, str]:
    if curl_requests is not None:
        r = curl_requests.get(
            direct_url,
            impersonate="chrome124",
            timeout=30,
            headers={
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Referer": "https://www.track-trace.com/",
            },
        )
        return r.status_code, r.text

    r = requests.get(direct_url, timeout=30)
    return r.status_code, r.text


def main() -> int:
    parser = argparse.ArgumentParser(description="EL AL AWB tracker (browserless only)")
    parser.add_argument("awb", nargs="?", default="11463866703")
    parser.add_argument("--prefix")
    args = parser.parse_args()

    try:
        pfx, serial = parse_awb(args.awb, args.prefix)
    except ValueError as exc:
        print(json.dumps({"error": str(exc)}, indent=2))
        return 1

    full_awb = f"{pfx}-{serial}"
    provider = track_via_provider(full_awb)

    output = {
        "awb": full_awb,
        "mode": "browserless",
        "carrier": provider.get("carrier"),
        "origin": provider.get("origin"),
        "direct_url": provider.get("direct_url"),
        "data_available": False,
        "status": None,
        "destination": None,
        "flight": None,
        "events": [],
        "reason": None,
    }

    if not provider.get("direct_url"):
        output["reason"] = "provider_direct_url_not_found"
        print(json.dumps(output, indent=2, ensure_ascii=False))
        return 0

    status_code, direct_html = fetch_direct_browserless(provider["direct_url"])
    if is_antibot_html(direct_html, status_code):
        output["reason"] = f"carrier_antibot_blocked_status_{status_code}"
        print(json.dumps(output, indent=2, ensure_ascii=False))
        return 0

    parsed = extract_tracking_data(direct_html)
    output.update(
        {
            "data_available": any(
                [parsed.get("status"), parsed.get("origin"), parsed.get("destination"), parsed.get("flight"), parsed.get("events")]
            ),
            "status": parsed.get("status"),
            "origin": parsed.get("origin") or output.get("origin"),
            "destination": parsed.get("destination"),
            "flight": parsed.get("flight"),
            "events": parsed.get("events", []),
            "reason": "ok" if parsed else "no_extractable_fields",
        }
    )
    print(json.dumps(output, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
