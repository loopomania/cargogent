from __future__ import annotations

import json
import re
import time
from typing import List, Optional

from bs4 import BeautifulSoup
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By

from .base import AirlineTracker
from .common import (
    clean_text,
    is_bot_blocked_html,
    summarize_from_events,
)
from models import TrackingEvent, TrackingResponse


# ── IATA milestone status codes ───────────────────────────────────────────────
MILESTONE_CODES = {
    "BKD": "Booking Confirmed",
    "RCS": "Received from Shipper",
    "MAN": "Manifested",
    "DEP": "Departed",
    "ARR": "Arrived",
    "RCF": "Received from Flight",
    "NFD": "Consignee Notified",
    "AWD": "Documents Delivered",
    "DLV": "Delivered",
    "FOH": "Freight On Hand",
    "DIS": "Discrepancy",
    "RDD": "Ready for Delivery",
    "CRC": "Customs Cleared",
    "FPS": "Freight Part Short",
    "DDL": "Delivered at Door",
}
_MONTHS = {"JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"}

# ── Lufthansa Cargo milestone table text parser ────────────────────────────────
# The LH Cargo website renders a table that (in text form) looks like:
#
#   LH8291  (TLV  FRA)  09 FEB           ← "flight header" row
#   MAN  TLV (Tel Aviv)  08 FEB / 21:35  09 FEB / 00:45  4 / 984 kg  4 / 984 kg
#   DEP  TLV (Tel Aviv)  09 FEB / 00:05  09 FEB / 00:11  ...
#   ARR  FRA (Frankfurt) 09 FEB / 06:45  09 FEB / 07:19  ...
#   RCF  FRA (Frankfurt) 09 FEB / 11:45  09 FEB / 17:18  ...
#
# Each event line has: status_code, location, planned_time, actual_time, pieces/weight
#
# "segment" is derived from the closest preceding flight header.

_FLIGHT_HDR_RE = re.compile(
    r"\b([A-Z0-9]{2,3}\d{3,5}[A-Z]?)\s*\(\s*([A-Z]{3})\s+([A-Z]{3})\s*\)\s*(\d{1,2}\s+[A-Z]{3}(?:\s+\d{2,4})?)",
    re.I,
)
# Matches: code  location  planned_datetime  actual_datetime  pieces_weight
_EVENT_RE = re.compile(
    r"\b(BKD|RCS|MAN|DEP|ARR|RCF|NFD|AWD|DLV|FOH|DIS|RDD|CRC)\b"
    r"[\s\S]{0,60}?"                                      # location text (may span)
    r"\b([A-Z]{3})\s*(?:\([^)]*\))?"                     # 3-letter IATA code
    r"\s*(\d{1,2}\s+[A-Z]{3}(?:\s+\d{2,4})?)\s*/\s*(\d{2}:\d{2})"  # planned date/time
    r"(?:\s*(\d{1,2}\s+[A-Z]{3}(?:\s+\d{2,4})?)\s*/\s*(\d{2}:\d{2}))?",  # optional actual
    re.I,
)

# Simpler: parse the plain-text version of the milestone table
# Works row-by-row; the text is the joined whitespace-collapsed page text.
_SIMPLE_EVENT_RE = re.compile(
    r"(?P<code>BKD|RCS|MAN|DEP|ARR|RCF|NFD|AWD|DLV|FOH|DIS)\s+"
    r"(?P<loc>[A-Z]{3})\s*(?:\([^)]*\))?"
    r"(?:\s*(?P<plan_date>\d{1,2}\s+[A-Z]{3}(?:\s+\d{2,4})?)\s*/\s*(?P<plan_time>\d{2}:\d{2}))?"
    r"(?:\s*(?P<act_date>\d{1,2}\s+[A-Z]{3}(?:\s+\d{2,4})?)\s*/\s*(?P<act_time>\d{2}:\d{2}))?"
    r"(?:\s*(?P<pcs>\d+)\s*/\s*(?P<weight>\d+(?:\.\d+)?)\s*kg)?",
    re.I,
)


def _parse_page_text(page_text: str) -> List[TrackingEvent]:
    """
    Parses Lufthansa Cargo milestone text (from JS-rendered page_text).
    Extracts:
      - flight header rows  → segment info for following events
      - milestone event rows with planned/actual times
    """
    events: List[TrackingEvent] = []

    # Normalise whitespace to single spaces
    text = re.sub(r"\s+", " ", page_text)

    # ── Find all flight-header positions ─────────────────────────────────────
    # These look like: "LH8291 ( TLV FRA ) 09 FEB"
    flight_hdrs = list(_FLIGHT_HDR_RE.finditer(text))

    # ── Find all event lines ──────────────────────────────────────────────────
    for m in re.finditer(
        r"\b(BKD|RCS|MAN|DEP|ARR|RCF|NFD|AWD|DLV|FOH|DIS)\b", text, re.I
    ):
        code = m.group(1).upper()
        pos = m.start()

        # Grab the 300-chars after the code for parsing
        snippet = text[pos : pos + 300]

        # Closest flight header BEFORE this event
        seg_flight: Optional[str] = None
        seg_from: Optional[str] = None
        seg_to: Optional[str] = None
        for fh in reversed(flight_hdrs):
            if fh.start() < pos:
                seg_flight = fh.group(1).upper().replace(" ", "")
                seg_from   = fh.group(2).upper()
                seg_to     = fh.group(3).upper()
                break

        # Grab the 300-chars AFTER the status code word (not starting at it)
        snippet = text[m.end() : m.end() + 300]

        # Extract IATA location code: first 3-letter ALL-CAPS word that isn't a month abbreviation
        loc: Optional[str] = None
        for tok_m in re.finditer(r"\b([A-Z]{3})\b", snippet):
            tok = tok_m.group(1)
            if tok not in _MONTHS and tok not in MILESTONE_CODES:
                loc = tok
                break

        # Extract datetime pairs: "DD MMM / HH:MM"
        dt_parts = re.findall(
            r"(\d{1,2}\s+[A-Z]{3}(?:\s+\d{2,4})?)\s*/\s*(\d{2}:\d{2})", snippet
        )
        planned_dt = f"{dt_parts[0][0]} {dt_parts[0][1]}" if len(dt_parts) > 0 else None
        actual_dt  = f"{dt_parts[1][0]} {dt_parts[1][1]}" if len(dt_parts) > 1 else None

        # Pieces / weight: "4 / 984 kg"
        pw_m = re.search(r"(\d+)\s*/\s*(\d+(?:\.\d+)?)\s*kg", snippet, re.I)
        pieces = pw_m.group(1) if pw_m else None
        weight = pw_m.group(2) if pw_m else None

        # Build remark with segment info for buildLegs
        remarks_parts = []
        if seg_from and seg_to:
            remarks_parts.append(f"Segment: {seg_from} to {seg_to}")
        if seg_flight:
            remarks_parts.append(f"Flight: {seg_flight}")
        if planned_dt and actual_dt and planned_dt != actual_dt:
            remarks_parts.append(f"Planned: {planned_dt}")

        # Prefer actual time, fall back to planned
        date = actual_dt or planned_dt

        events.append(TrackingEvent(
            status_code=code,
            status=MILESTONE_CODES.get(code, "Unknown"),
            location=loc,
            date=date,
            pieces=pieces,
            weight=weight,
            flight=seg_flight,
            remarks=" | ".join(remarks_parts) if remarks_parts else "Extracted from milestone text",
        ))

    # Deduplicate: keep first occurrence of each (code, location, date) triple
    seen: set = set()
    unique: List[TrackingEvent] = []
    for ev in events:
        key = (ev.status_code, ev.location, ev.date)
        if key not in seen:
            seen.add(key)
            unique.append(ev)

    # Filter out "orphan ghost" events: events with no segment remark that appeared
    # before a real flight header (manifested-but-not-boarded scans, booking errors).
    def _has_segment(ev: TrackingEvent) -> bool:
        return bool(ev.remarks and "Segment:" in ev.remarks)

    # Count occurrences of each status code
    from collections import Counter
    code_counts = Counter(ev.status_code for ev in unique)

    # Rules:
    # - BKD/RCS: always keep (booking events, never have segment context)
    # - DLV/NFD/AWD: keep if has segment remark OR is the only one of its kind
    #   (the real delivered event won't have a ghost duplicate)
    # - All others (DEP/ARR/MAN/RCF): must have segment remark
    BOOKING_CODES = {"BKD", "RCS"}
    TERMINAL_CODES = {"DLV", "NFD", "AWD"}

    def _keep(ev: TrackingEvent) -> bool:
        code = ev.status_code or ""
        if code in BOOKING_CODES:
            return True
        if code in TERMINAL_CODES:
            return _has_segment(ev) or code_counts[code] == 1
        return _has_segment(ev)

    unique = [ev for ev in unique if _keep(ev)]

    # Sort by date string so summarize_from_events gets origin from earliest event
    unique.sort(key=lambda ev: ev.date or "")

    return unique


def _parse_json_response(payload: dict) -> List[TrackingEvent]:
    """
    Parse the JSON response from Lufthansa Cargo's internal API.
    The structure varies; we try the known shapes.
    """
    events: List[TrackingEvent] = []

    shipments = payload.get("shipments") or payload.get("awbDetails") or []
    if isinstance(payload, list):
        shipments = payload

    for ship in (shipments if isinstance(shipments, list) else [shipments]):
        segments = ship.get("flightLegs") or ship.get("segments") or []
        for seg in segments:
            flt = seg.get("flightNo") or seg.get("flight") or ""
            seg_from = seg.get("from") or seg.get("origin") or ""
            seg_to   = seg.get("to") or seg.get("destination") or ""
            seg_info = f"Segment: {seg_from} to {seg_to}" if seg_from and seg_to else ""
            remark_base = f"{seg_info} | Flight: {flt}".strip(" |")

            milestones = seg.get("milestones") or seg.get("events") or []
            for ms in milestones:
                code = (ms.get("code") or ms.get("status") or "").upper()
                if code not in MILESTONE_CODES:
                    continue
                loc    = ms.get("station") or ms.get("location") or seg_to
                plan   = ms.get("plannedDate") or ms.get("planned")
                actual = ms.get("actualDate") or ms.get("actual")
                pcs    = ms.get("pieces") or ms.get("quantity")
                wgt    = ms.get("weight")
                events.append(TrackingEvent(
                    status_code=code,
                    status=MILESTONE_CODES.get(code, "Unknown"),
                    location=loc,
                    date=actual or plan,
                    pieces=str(pcs) if pcs else None,
                    weight=str(wgt) if wgt else None,
                    flight=flt or None,
                    remarks=remark_base or None,
                ))

        # Also check top-level milestone array
        for ms in ship.get("milestones") or ship.get("events") or []:
            code = (ms.get("code") or ms.get("status") or "").upper()
            if code not in MILESTONE_CODES:
                continue
            loc    = ms.get("station") or ms.get("location")
            plan   = ms.get("plannedDate") or ms.get("planned")
            actual = ms.get("actualDate") or ms.get("actual")
            pcs    = ms.get("pieces")
            wgt    = ms.get("weight")
            events.append(TrackingEvent(
                status_code=code,
                status=MILESTONE_CODES.get(code, "Unknown"),
                location=loc,
                date=actual or plan,
                pieces=str(pcs) if pcs else None,
                weight=str(wgt) if wgt else None,
            ))

    return events


class LufthansaTracker(AirlineTracker):
    name = "lufthansa"
    tracking_url = "https://www.lufthansa-cargo.com/en/eservices/etracking"

    async def track(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        return await self.run_sync(self._track_sync, awb, hawb=hawb, **kwargs)

    def _track_sync(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        awb_clean = awb.replace("-", "").replace(" ", "")
        prefix = awb_clean[:3]
        number = awb_clean[3:]
        message = "Success"
        blocked = False
        page_text = ""
        captured_json: Optional[dict] = None

        # Navigate to the detail page and intercept XHR
        detail_url = (
            f"https://www.lufthansa-cargo.com/en/eservices/etracking/awb-details/-/awb/{prefix}/{number}"
            "?searchFilter=awb"
        )

        options = uc.ChromeOptions()
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_argument("--window-size=1920,1080")
        options.add_argument(
            "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
        # Enable browser performance log to intercept network requests
        options.set_capability("goog:loggingPrefs", {"performance": "ALL"})

        if self.proxy:
            from .proxy_util import get_rotating_proxy, get_proxy_extension
            rotated_proxy = get_rotating_proxy(self.proxy)
            ext_path = get_proxy_extension(rotated_proxy, f"/tmp/proxy_ext_{self.name}")
            if ext_path:
                options.add_argument(f"--load-extension={ext_path}")
            else:
                options.add_argument(f"--proxy-server={rotated_proxy}")

        driver = None
        try:
            driver = uc.Chrome(options=options, headless=False, use_subprocess=False, version_main=146)
            driver.set_page_load_timeout(60)
            driver.get(detail_url)
            time.sleep(4)

            # Accept cookie consent
            for selector in [
                (By.ID, "uc-btn-accept-banner"),
                (By.XPATH, "//button[contains(text(),'Accept all')]"),
                (By.XPATH, "//button[contains(@id,'accept')]"),
            ]:
                try:
                    btn = driver.find_element(*selector)
                    if btn.is_displayed():
                        btn.click()
                        time.sleep(2)
                        break
                except Exception:
                    pass

            # Wait for dynamic content to render (tracking table)
            time.sleep(15)

            html = driver.page_source
            if is_bot_blocked_html(html) or "just a moment" in html.lower():
                blocked = True
                message = "Cloudflare challenge blocking Lufthansa."
            else:
                message = "Successfully loaded Lufthansa tracking page."

            # ── Extract via browser performance log (network intercept) ──────────
            if not blocked:
                try:
                    logs = driver.get_log("performance")
                    for entry in logs:
                        try:
                            log_msg = json.loads(entry["message"])["message"]
                            if log_msg.get("method") != "Network.responseReceived":
                                continue
                            url = log_msg.get("params", {}).get("response", {}).get("url", "")
                            # LH Cargo's tracking widget calls an endpoint like:
                            # /lh-cargo-tracking/api/...  or  /en/eservices/etracking/-/awb/tracking/...
                            if ("tracking" in url or "awb" in url) and ("api" in url or "eservices" in url):
                                req_id = log_msg["params"]["requestId"]
                                try:
                                    body = driver.execute_cdp_cmd(
                                        "Network.getResponseBody", {"requestId": req_id}
                                    )
                                    text_body = body.get("body", "")
                                    if text_body and "{" in text_body:
                                        captured_json = json.loads(text_body)
                                        break
                                except Exception:
                                    pass
                        except Exception:
                            pass
                except Exception:
                    pass

            # ── Grab rendered page text ───────────────────────────────────────
            if not blocked:
                page_text = driver.execute_script("""
                    function getAllText(node) {
                        let text = " ";
                        if (node.nodeType === Node.TEXT_NODE) {
                            text += node.textContent + " ";
                        }
                        if (node.shadowRoot) { text += getAllText(node.shadowRoot); }
                        if (node.childNodes) {
                            for (let child of node.childNodes) { text += getAllText(child); }
                        }
                        return text;
                    }
                    return getAllText(document.body);
                """)

                # Debug dumps
                with open("lufthansa_debug.html", "w") as f:
                    f.write(html)
                with open("lufthansa_debug_text.txt", "w") as f:
                    f.write(page_text)

        except Exception as exc:
            message = f"Undetected-chromedriver fetch failed: {exc}"
            blocked = True
        finally:
            if driver:
                try:
                    driver.quit()
                except Exception:
                    pass

        # ── Parse events ──────────────────────────────────────────────────────
        events: List[TrackingEvent] = []

        # 1. Try captured XHR JSON first
        if captured_json:
            events = _parse_json_response(captured_json)

        # 2. Fall back to page-text parser (improved)
        if not events and page_text and not blocked:
            events = _parse_page_text(page_text)

        origin, destination, status, flight = summarize_from_events(events)

        # Patch origin/destination from page text if still missing
        if not origin:
            m = re.search(r"Origin\s+Destination\s+([A-Z]{3})\s+([A-Z]{3})", page_text)
            if m:
                origin, destination = m.group(1), m.group(2)

        return TrackingResponse(
            airline=self.name,
            awb=awb_clean,
            origin=origin,
            destination=destination,
            status=status,
            flight=flight,
            events=events,
            blocked=blocked,
            message=message,
            raw_meta={"source_url": detail_url},
        )
