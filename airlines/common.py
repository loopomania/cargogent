from __future__ import annotations

import re
from typing import Iterable, List, Optional, Sequence, Tuple

import requests
from bs4 import BeautifulSoup

try:
    from curl_cffi import requests as curl_requests
except ImportError:
    curl_requests = None

from models import TrackingEvent


DEFAULT_TRACKING_CODES = {
    "BKD", "RCS", "DEP", "ARR", "RCF", "NFD", "AWD", "DLV",
    "FOH", "MSG", "DIS", "MAN", "RDD", "CRC", "FPS", "DDL",
}
NOISE_CODES = {"MSG"}


def normalize_awb(raw_awb: str, default_prefix: str = "114") -> Tuple[str, str]:
    awb = raw_awb.strip().replace("-", "").replace(" ", "")
    if len(awb) >= 11 and awb[:11].isdigit():
        return awb[:3], awb[3:11]
    if len(awb) == 8 and awb.isdigit():
        return default_prefix, awb
    # Keep behavior permissive to match previous implementation.
    return default_prefix, awb[:8]


def clean_text(s: Optional[str]) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", s.replace("\xa0", " ")).strip()


def extract_events_from_table_rows(
    rows: Iterable[Sequence[str]],
    tracking_codes: Optional[set] = None,
) -> List[TrackingEvent]:
    codes = tracking_codes or DEFAULT_TRACKING_CODES
    events: List[TrackingEvent] = []
    for cells in rows:
        parts = [clean_text(c) for c in cells if clean_text(c)]
        if len(parts) < 2:
            continue
        status_code = parts[0].upper()
        if status_code not in codes:
            continue

        flight = None
        for cell in parts:
            comp = cell.replace(" ", "")
            if re.match(r"^[A-Z]{2}\d{3,4}$", comp):
                flight = comp
                break

        event = TrackingEvent(
            status_code=status_code,
            location=parts[1] if len(parts) > 1 else None,
            date=parts[2] if len(parts) > 2 else None,
            pieces=parts[3] if len(parts) > 3 else None,
            weight=parts[4] if len(parts) > 4 else None,
            remarks=" ".join(parts[5:]).strip() if len(parts) > 5 else "",
            flight=flight,
        )
        # Drop obvious header/legend rows.
        if (event.date or "").lower() in {"date/time", "date"}:
            continue
        events.append(event)
    return events


def parse_events_from_html_table(html: str) -> List[TrackingEvent]:
    soup = BeautifulSoup(html, "html.parser")
    rows = []
    for tr in soup.find_all("tr"):
        cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
        if cells:
            rows.append(cells)
    return extract_events_from_table_rows(rows)


def summarize_from_events(events: List[TrackingEvent]) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
    meaningful = [e for e in events if (e.status_code or "").upper() not in NOISE_CODES]
    if not meaningful:
        return None, None, None, None
    origin = meaningful[0].location
    destination = meaningful[-1].location
    status = meaningful[-1].status_code
    flight = next((e.flight for e in meaningful if e.flight), None)
    return origin, destination, status, flight


def is_bot_blocked_html(html: str) -> bool:
    lower = html.lower()
    return any(marker in lower for marker in ("kramericaindustries", "rbzns", "cf-turnstile", "access denied"))


def track_trace_query(awb: str) -> Optional[str]:
    """
    Submits the AWB to track-trace.com/aircargo and extracts the
    direct carrier URL (from iframe or direct-form wrapper).
    """
    tracktrace_url = "https://www.track-trace.com/aircargo"
    try:
        response = requests.post(
            tracktrace_url,
            data={"number": awb, "config": "205200", "commit": "Track with options"},
            timeout=30,
        )
        response.raise_for_status()
        html = response.text
        
        # Save track trace response for debug
        with open("track_trace_debug.html", "w") as f:
            f.write(html)
            
        soup = BeautifulSoup(html, "html.parser")

        # Check for iframe first
        iframe = soup.select_one("iframe.track_res_frame")
        if iframe and iframe.get("src"):
            return iframe.get("src")

        # Fallback to direct form query
        tf = requests.post(
            f"{tracktrace_url}/track_form",
            data={"number": awb, "config": "205200"},
            timeout=30,
        )
        tf.raise_for_status()
        m = re.search(r'<div id="direct-form">(.*?)</div>', tf.text, re.IGNORECASE | re.DOTALL)
        if m:
            return BeautifulSoup(m.group(1), "html.parser").get_text(strip=True)
    except Exception:
        pass
    return None


def fetch_direct_with_impersonation(url: str) -> str:
    """
    Fetches the URL mimicking a real Chrome browser to bypass basic anti-bot TLS checks.
    """
    if curl_requests is None:
        raise ImportError("curl_cffi is required for fetch_direct_with_impersonation")

    headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://www.track-trace.com/",
    }
    r = curl_requests.get(url, impersonate="chrome124", timeout=45, headers=headers)
    r.raise_for_status()
    return r.text
