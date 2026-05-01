from __future__ import annotations

import logging
import re
import time
from typing import List, Optional

from bs4 import BeautifulSoup
from .base import AirlineTracker
from .common import (
    clean_text,
    is_bot_blocked_html,
    summarize_from_events,
)
from models import TrackingEvent, TrackingResponse

logger = logging.getLogger(__name__)

# TAP Status Mapping
TAP_STATUS_MAP = {
    "BKD": "Booking Confirmed",
    "RCS": "Received from Shipper",
    "MAN": "Manifested",
    "DEP": "Departed",
    "ARR": "Arrived",
    "RCF": "Received from Flight",
    "NFD": "Consignee Notified",
    "DLV": "Delivered",
    "CCD": "Customs Released",
    "CRC": "Customs Communicated",
    "DIS": "Discrepancy",
    "FOH": "Freight On Hand",
    "RCT": "Received from Other Airline",
    "TRM": "Transferring to Other Airline",
    "TFD": "Transferred to Other Airline",
    "AWD": "Documents Delivered",
}

class TapTracker(AirlineTracker):
    name = "tap"
    tracking_url = "https://www.tapcargo.com/en/e-tracking"

    async def track(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        return await self.run_sync(self._track_sync, awb, hawb=hawb, **kwargs)

    def _track_sync(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        awb_clean = awb.replace("-", "").replace(" ", "")
        prefix = awb_clean[:3]
        number = awb_clean[3:]
        awb_fmt = f"{prefix}-{number}"
        message = "Success"
        blocked = False
        trace = []
        json_data = None

        # Target URL for TAP e-tracking
        detail_url = f"https://www.tapcargo.com/en/e-tracking-results?ciaCode={prefix}&awb={number}"
        if hawb:
            detail_url += f"&hawb={hawb}"
            
        api_url = "https://www.tapcargo.com/api/cargo/cargo-flight-list?functionName=retrieveCargoETracking"
        payload = {"AirwayBillNumber": f"{prefix}{number}"}

        from playwright.sync_api import sync_playwright
        import random

        if not self.proxy:
            # TAP strongly requires proxies for automated access
            blocked = True
            message = "A Scraping Browser WSS URI must be provided for TAP Air Portugal."
        else:
            trace.append("init_playwright_cdp")
            try:
                with sync_playwright() as p:
                    trace.append("connecting_ws")
                    browser = p.chromium.connect_over_cdp(self.proxy)
                    page = browser.new_page()

                    # Block heavy resources to speed up load
                    page.route("**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf,otf,css}", lambda route: route.abort())
                    
                    trace.append("navigating_to_homepage")
                    page.goto("https://www.tapcargo.com/en", timeout=60000)
                    
                    time.sleep(random.uniform(1.0, 3.0)) # Pacing
                    
                    trace.append("fetching_api")
                    json_data = page.evaluate('''async (args) => {
                        try {
                            const response = await fetch(args.url, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify(args.payload)
                            });
                            return await response.json();
                        } catch (e) {
                            return {error: e.toString()};
                        }
                    }''', {"url": api_url, "payload": payload})
                    
                    if not json_data:
                        message = "Empty JSON response from API."
                    elif "error" in json_data:
                        blocked = True
                        message = f"API Error: {json_data['error']}"
                    elif "Awb" not in json_data:
                        message = "AWB not found or invalid format."
                    else:
                        message = "Successfully loaded TAP tracking data."
                    
                    browser.close()
            except Exception as e:
                trace.append(f"driver_error:{str(e)[:40]}")
                message = f"Driver Error: {str(e)[:40]}"

        # ── Parsing Logic ────────────────────────────────────────────────────
        events: List[TrackingEvent] = []
        origin = None
        destination = None
        
        if not blocked and json_data and "Awb" in json_data:
            awb_data = json_data["Awb"]
            origin = awb_data.get("AwbOrigin")
            destination = awb_data.get("AwbDestination")
            
            segments = []
            if "Segments" in awb_data and "Segment" in awb_data["Segments"]:
                seg_data = awb_data["Segments"]["Segment"]
                if isinstance(seg_data, list):
                    segments = seg_data
                elif isinstance(seg_data, dict):
                    segments = [seg_data]
                    
            for seg in segments:
                status_code = seg.get("StatusCode", "").strip()
                if not status_code:
                    if status_desc == "Planned For Flight":
                        status_code = "BKD"
                    else:
                        continue  # Filter out spammy empty status codes
                        
                if status_code == "KK":
                    status_code = "BKD"
                    
                status_desc = seg.get("Status", "").strip()
                
                # e.g. "23APR26", "11:04"
                event_date = seg.get("EventDate", "").strip()
                event_time = seg.get("EventTime", "").strip()
                date_str = None
                if event_date:
                    date_str = f"{event_date} {event_time}".strip()
                    
                flight = seg.get("FlightNum", "").strip()
                
                # Arrival events should use Destination location
                if status_code in ["RCF", "ARR", "DLV", "AWD", "NFD", "CCD", "CRC"]:
                    loc = seg.get("Dest", "").strip()
                else:
                    loc = seg.get("Origin", "").strip()
                
                if status_code in TAP_STATUS_MAP:
                    mapped_status = TAP_STATUS_MAP[status_code]
                elif status_code == "BKD" and status_desc == "Planned For Flight":
                    mapped_status = "Planned For Flight"
                elif status_code == "BKD":
                    mapped_status = "Booking Confirmed"
                elif status_desc:
                    mapped_status = status_desc
                else:
                    mapped_status = "Unknown"
                    
                events.append(TrackingEvent(
                    status_code=status_code,
                    status=mapped_status,
                    location=loc or None,
                    date=date_str or None,
                    flight=flight or None,
                    remarks=f"{status_desc} (TAP)" if status_desc else None,
                ))

            # ── Interpolation Logic ──
            routing = []
            if "Routing" in awb_data and "line" in awb_data["Routing"]:
                r_data = awb_data["Routing"]["line"]
                if isinstance(r_data, list):
                    routing = r_data
                elif isinstance(r_data, dict):
                    routing = [r_data]
                    
            def has_physical_progress(f_num: str) -> bool:
                return any(e.status_code in ['DEP', 'RCF', 'ARR', 'DLV', 'AWD', 'NFD', 'MAN'] and e.flight == f_num for e in events)
                
            def has_status(f_num: str, code: str) -> bool:
                return any(e.status_code == code and e.flight == f_num for e in events)
                
            calculated_events = []
            for i, leg in enumerate(routing):
                flight_num = leg.get("FlightNum", "").strip()
                flight_date = leg.get("FlightDate", "").strip()
                origin = leg.get("FlightOrigin", "").strip()
                dest = leg.get("FlightDest", "").strip()
                
                if not flight_num:
                    continue
                
                leg_arrived = has_status(flight_num, 'ARR') or has_status(flight_num, 'RCF')
                
                subsequent_started = False
                for j in range(i + 1, len(routing)):
                    next_flight = routing[j].get("FlightNum", "").strip()
                    if has_physical_progress(next_flight):
                        subsequent_started = True
                        break
                
                if (subsequent_started or leg_arrived) and not has_status(flight_num, 'DEP'):
                    calculated_events.append(TrackingEvent(
                        status_code="DEP",
                        status=TAP_STATUS_MAP.get("DEP", "Departed"),
                        location=origin or None,
                        date=flight_date or None,
                        flight=flight_num,
                        remarks="Departed (TAP - Calculated)",
                    ))
                
                if subsequent_started and not leg_arrived:
                    calculated_events.append(TrackingEvent(
                        status_code="ARR",
                        status=TAP_STATUS_MAP.get("ARR", "Arrived"),
                        location=dest or None,
                        date=flight_date or None,
                        flight=flight_num,
                        remarks="Arrived (TAP - Calculated)",
                    ))
                    
            events.extend(calculated_events)
            
            # Sort events by routing leg to ensure summary matches the chronological tail
            flight_to_leg = {leg.get("FlightNum", "").strip(): idx for idx, leg in enumerate(routing)}
            events_with_idx = list(enumerate(events))
            events_with_idx.sort(key=lambda x: (flight_to_leg.get(x[1].flight or "", 999), x[0]))
            events = [e for _, e in events_with_idx]

        # Cleanup and summary
        summary_origin, summary_dest, status, flight = summarize_from_events(events)

        return TrackingResponse(
            airline=self.name,
            awb=awb_fmt,
            origin=origin or summary_origin,
            destination=destination or summary_dest,
            status=status,
            flight=flight,
            events=events,
            blocked=blocked,
            message=message,
            raw_meta={"source_url": detail_url, "trace": trace},
        )
