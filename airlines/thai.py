from __future__ import annotations

import logging
import re
import time
from typing import List, Optional

from .base import AirlineTracker
from .common import (
    summarize_from_events,
    is_bot_blocked_html,
)
from models import TrackingEvent, TrackingResponse

logger = logging.getLogger(__name__)

THAI_STATUS_MAP = {
    "BKD": "Booked",
    "RCS": "Received from Shipper",
    "MAN": "Manifested",
    "DEP": "Departed",
    "ARR": "Arrived",
    "RCF": "Received from Flight",
    "DLV": "Delivered",
    "NFD": "Consignee Notified",
    "AWD": "Documents Delivered",
    "CRC": "Customs Cleared",
    "RCD": "Received from Dock",
}

class ThaiTracker(AirlineTracker):
    name = "thai"
    tracking_url = "https://www.thaicargo.com"

    async def track(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        return await self.run_sync(self._track_sync, awb, hawb=hawb, **kwargs)

    def _track_sync(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        awb_clean = awb.replace("-", "").replace(" ", "")
        prefix = awb_clean[:3]
        number = awb_clean[3:]
        awb_fmt = f"{prefix}-{number}"
        message = "Success"
        blocked = False
        page_text = ""
        trace = []

        # SkyChain Public Tracking URL for Thai
        # Note: Thai often requires navigating from the home page to establish a session
        home_url = "https://www.thaicargo.com"
        
        from playwright.sync_api import sync_playwright
        import random

        if not self.proxy:
            blocked = True
            message = "A Scraping Browser WSS URI must be provided for Thai Airways."
        else:
            trace.append("init_playwright_cdp")
            try:
                with sync_playwright() as p:
                    trace.append("connecting_ws")
                    browser = p.chromium.connect_over_cdp(self.proxy)
                    page = browser.new_page()

                    page.route("**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf,otf,css}", lambda route: route.abort())
                    
                    trace.append("navigating_to_home")
                    page.goto(home_url, timeout=60000)
                    time.sleep(random.uniform(2.0, 3.0))

                    trace.append("navigating_to_skychain")
                    # Thai Cargo recently changed their endpoint to use PID=WEB01-10 instead of service=page/PublicTracking
                    direct_url = f"https://chorus.thaicargo.com/skychain/app?PID=WEB01-10&doc_typ=AWB&awb_pre={prefix}&awb_no={number}"
                    page.goto(direct_url, timeout=60000, wait_until="domcontentloaded")

                    time.sleep(random.uniform(8.0, 10.0)) # SkyChain uses a JS redirect on load, wait for it to finish
                    
                    # Handle iframes if results are inside one
                    frames = page.frames
                    trace.append(f"frames_found:{len(frames)}")
                    
                    content_found = False
                    for frame in frames:
                        try:
                            text = frame.evaluate("() => document.body.innerText") or ""
                            if any(kw in text for kw in ["Booked", "Departed", "Arrived", "RCS", "DEP"]):
                                page_text = text
                                content_found = True
                                trace.append("content_found_in_frame")
                                break
                        except:
                            continue
                    
                    if not content_found:
                        page_text = page.evaluate("() => document.body.innerText") or ""
                    
                    html = page.content()
                    if is_bot_blocked_html(html) or "just a moment" in html.lower():
                        blocked = True
                        message = "Bot challenge blocking Thai Airways."
                    elif "No record found" in page_text or "not exist" in page_text.lower():
                        message = "AWB not found."
                    else:
                        message = "Successfully loaded Thai tracking page."
                    
                    trace.append(f"page_text_len:{len(page_text)}")
                    browser.close()
            except Exception as e:
                trace.append(f"driver_error:{str(e)[:40]}")
                message = f"Driver Error: {str(e)[:40]}"

        # ── Parsing Logic ────────────────────────────────────────────────────
        events: List[TrackingEvent] = []
        
        STATUS_MAP_REVERSE = {
            "Booked": "BKD",
            "Received from Shipper": "RCS",
            "Manifested": "MAN",
            "Departed": "DEP",
            "Arrived": "ARR",
            "Received from Flight": "RCF",
            "Delivered": "DLV",
            "Consignee Notified": "NFD",
            "Documents Delivered": "AWD",
            "Customs Cleared": "CRC",
            "Discrepancy": "DIS",
        }
        
        if not blocked and page_text:
            lines = [l.strip().replace("\xa0", " ") for l in page_text.split("\n") if l.strip()]
            for line in lines:
                # 1. Match SkyChain Table format: Station | Status Date | Status | Flight Details | Pieces | Weight
                match = re.search(r"([A-Z]{3})\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+\d{2}:\d{2})\s+([A-Za-z\s]+?)\s+(TG\d{3,4}|LY\d{3,4}|[A-Z0-9]{2,3}\d{3,4}|-)", line, re.I)
                
                # 2. Match standard API/Legacy format (Fallback)
                legacy_match = re.search(r"\b(BKD|RCS|MAN|DEP|ARR|RCF|DLV|NFD|AWD|CRC)\b\s+([A-Z]{3})\b\s+(\d{1,2}-[A-Za-z]{3}-\d{4})\s+(\d{2}:\d{2})", line, re.I)
                
                if match:
                    loc = match.group(1).upper()
                    date_str = match.group(2)
                    status_text = match.group(3).strip()
                    flight = match.group(4)
                    if flight == "-": flight = None
                    
                    pieces_weight_m = re.search(r"\s+(\d+)\s+([\d\.]+)\s*K?$", line)
                    pieces = pieces_weight_m.group(1) if pieces_weight_m else None
                    weight = pieces_weight_m.group(2) if pieces_weight_m else None
                    
                    code = STATUS_MAP_REVERSE.get(status_text, "UNKN")
                    if code == "UNKN":
                        # Attempt to see if the status_text is actually a code
                        if status_text in THAI_STATUS_MAP: code = status_text
                        
                    events.append(TrackingEvent(
                        status_code=code,
                        status=status_text if code != "UNKN" else THAI_STATUS_MAP.get(code, status_text),
                        location=loc,
                        date=date_str,
                        flight=flight,
                        pieces=pieces,
                        weight=weight,
                        remarks=f"{status_text} (Thai)",
                    ))
                elif legacy_match:
                    code = legacy_match.group(1).upper()
                    loc = legacy_match.group(2).upper()
                    date_str = f"{legacy_match.group(3)} {legacy_match.group(4)}"
                    flight_m = re.search(r"\b(TG\d{3,4})\b", line)
                    flight = flight_m.group(1) if flight_m else None
                    
                    events.append(TrackingEvent(
                        status_code=code,
                        status=THAI_STATUS_MAP.get(code, code),
                        location=loc,
                        date=date_str,
                        flight=flight,
                        remarks=f"{THAI_STATUS_MAP.get(code, code)} (Thai)",
                    ))

        origin, destination, status, flight = summarize_from_events(events)

        return TrackingResponse(
            airline=self.name,
            awb=awb_fmt,
            origin=origin,
            destination=destination,
            status=status,
            flight=flight,
            events=events,
            blocked=blocked,
            message=message,
            raw_meta={"trace": trace},
        )
