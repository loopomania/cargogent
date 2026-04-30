from __future__ import annotations

import shutil
import re
import os
import sys
import time
from typing import List
from datetime import datetime

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from .base import AirlineTracker
from .common import normalize_awb
from .proxy_util import get_rotating_proxy, get_proxy_extension
from models import TrackingResponse, TrackingEvent


class ElAlTracker(AirlineTracker):
    name = "elal"
    main_url = "https://www.elal.com/en/Cargo/Pages/Online-Tracking.aspx"

    async def track(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        """Offload sync UC/Selenium work to the shared browser executor."""
        return await self.run_sync(self._track_sync, awb, hawb=hawb, **kwargs)

    def _track_sync(self, awb: str, hawb=None) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="114")
        awb_fmt = f"{prefix}-{serial}"
        message = "Success"
        blocked = False
        events: List[TrackingEvent] = []
        origin = None
        destination = None
        trace = []
        ajax_data = []

        # === PLAYWRIGHT BRIGHT DATA CDP ===
        from playwright.sync_api import sync_playwright
        import random
        
        legacy_url = f"https://www.elalextra.net/info/awb.asp?aid={prefix}&awb={serial}&Lang=Eng"
        legacy_text = ""
        
        if not getattr(self, "proxy", None):
            blocked = True
            message = "A Scraping Browser WSS URI must be provided for El Al."
        else:
            trace.append("init_playwright_cdp")
            try:
                with sync_playwright() as p:
                    for attempt in range(2):
                        trace.append(f"attempt_{attempt+1}")
                        try:
                            # Expecting self.proxy to be a wss:// endpoint specifically for Scraping Browser
                            trace.append("connecting_ws")
                            browser = p.chromium.connect_over_cdp(self.proxy)
                            page = browser.new_page()
                            
                            # === AKAMAI MITIGATION (TELEMETRY FARMING) ===
                            trace.append("farming_akamai_telemetry_pw")
                            
                            page.goto(legacy_url, timeout=60000)
                            time.sleep(random.uniform(2.5, 4.0)) # bm_sz pacing
                
                            # Generate generic physical telemetry (Mouse / Scrolling)
                            try:
                                page.mouse.move(random.randint(100, 500), random.randint(100, 500))
                                for _ in range(3):
                                    page.mouse.move(random.randint(50, 400), random.randint(50, 400))
                                    time.sleep(random.uniform(0.3, 1.2))
                                
                                page.mouse.wheel(delta_x=0, delta_y=random.randint(100, 400))
                                time.sleep(random.uniform(1.0, 2.0))
                            except Exception as act_e:
                                trace.append(f"telemetry_fail:{str(act_e)[:20]}")
                
                            # Allow Akamai to process our telemetry payload. If the _abck cookie was blocked (-1),
                            # this reload forces the server to inspect our telemetry and issue a validated token.
                            page.reload(timeout=60000)
                            trace.append("akamai_cookies_upgraded_pw")
                            time.sleep(random.uniform(2.5, 4.0)) # Let the new cookies settle
                            
                            # Fetching the formatted innerText directly off the DOM
                            legacy_text = page.evaluate("document.body.innerText")
                            
                            browser.close()
                            
                            # Validate text
                            if not legacy_text or "Access Denied" in legacy_text or "Access denied" in legacy_text:
                                trace.append("akamai_blocked_legacy")
                                time.sleep(2) # Give proxy pool a breath before retry
                                continue # Try again
                            
                            trace.append(f"legacy_text_len:{len(legacy_text)}")
                            break # Success, exit retry loop
                            
                        except Exception as inner_e:
                            trace.append(f"driver_error_attempt_{attempt+1}:{str(inner_e)[:40]}")
                            time.sleep(2)
                            continue

            except Exception as e:
                trace.append(f"driver_error:{str(e)[:40]}")
                message = f"Driver Error: {str(e)[:40]}"
        
        # STRATEGY 1: Legacy Text URL Parsing
        if legacy_text:
            if "Access Denied" in legacy_text or "Access denied" in legacy_text:
                trace.append("akamai_blocked_legacy_final")
                blocked = True
                message = "Akamai / bot protection blocked the request."
            else:
                events = self._parse_legacy_text(legacy_text)
                if events:
                    trace.append("legacy_parse_success")


        if ajax_data and not events:
            events = self._parse_ajax_data(ajax_data)
            trace.append("ajax_events_parsed")

        return self._finalize_response(awb_fmt, events, trace, message, blocked)

    def _finalize_response(self, awb_fmt, events, trace, message="Success", blocked=False):
        status, flight = None, None
        origin = None
        destination = None
        
        if events:
            def parse_dt(e):
                try:
                    return datetime.strptime(e.date, "%d %b %y %H:%M")
                except ValueError:
                    try:
                        return datetime.strptime(e.date, "%d-%b-%y %H:%M")
                    except ValueError:
                        pass
                return datetime.min

            # Deduplicate events (same status, date, location)
            unique_events = []
            seen = set()
            for e in events:
                # Normalize date string to avoid mismatch based on format
                dt = parse_dt(e)
                if dt != datetime.min:
                    e.date = dt.strftime("%Y-%m-%d %H:%M")
                
                key = (e.status_code, e.location, e.date)
                if key not in seen:
                    seen.add(key)
                    unique_events.append(e)

            events = unique_events
            
            # Sort by the parsed datetime
            events.sort(key=lambda e: e.date)
            
            dep_events = [e for e in events if e.status_code == "DEP"]
            arr_events = [e for e in events if e.status_code == "ARR"]
            
            if dep_events:
                origin = dep_events[0].location
            else:
                origin = next((e.location for e in events if e.location), None)
            
            if arr_events:
                destination = arr_events[-1].location
            else:
                destination = next((e.location for e in reversed(events) if e.location), None)

            status = events[-1].status if events else "UNKN"
            flight = next((e.flight for e in reversed(events) if e.flight), None)

        if not events and not blocked and message == "Success":
            message = "No tracking events found"

        return TrackingResponse(
            airline=self.name, awb=awb_fmt, origin=origin, destination=destination,
            status=status, flight=flight, events=events, message=message, blocked=blocked,
            raw_meta={"trace": trace},
        )

    def _parse_ajax_data(self, data: list) -> List[TrackingEvent]:
        events: List[TrackingEvent] = []
        if not data or not isinstance(data, list): return events
        
        def s(val): return str(val).strip() if val is not None else None
        
        def map_code(raw_type):
            if not raw_type: return "UNKN"
            t = raw_type.upper()
            if t == "B": return "BKD"
            if t == "R": return "RCS"
            if t == "E": return "DEP" 
            if t == "A": return "ARR" 
            return t if len(t) == 3 else "UNKN"

        for item in data:
            raw_date = s(item.get('PointDateStr','')) 
            raw_time = s(item.get('DepTime',''))      
            
            clean_date = None
            if raw_date and raw_time:
                try:
                    dt = datetime.strptime(f"{raw_date} {raw_time}", "%d-%b-%y %H:%M")
                    clean_date = dt.strftime("%d %b %y %H:%M")
                except:
                    clean_date = f"{raw_date} {raw_time}"

            events.append(TrackingEvent(
                status_code=map_code(s(item.get("TYPE"))),
                status=s(item.get("DetailedStatus")),
                location=s(item.get("Origin") or item.get("Dest")),
                date=clean_date,
                flight=s(item.get("Flight")),
                pieces=s(item.get("PCS")), 
                weight=s(item.get("Weight")),
                remarks=s(item.get("DetailedStatus")),
            ))
        return events

    def _parse_legacy_text(self, text: str) -> List[TrackingEvent]:
        events: List[TrackingEvent] = []
        failed_flights = set()
        
        # 1. Parse flight legs (Table 2) first to identify failed/unloaded flights
        pattern2 = r"([A-Z0-9]{2}\s+\d+)\s*[|\t ]+\s*[^|\t\n]+[|\t ]+\s*([A-Z])\s*[|\t ]+(\d{1,2}\s+[A-Za-z]{3}\s+\d{2}\s+\d{2}:\d{2})\s*[|\t ]+\s*([A-Z])\s*[|\t ]+(\d{1,2}\s+[A-Za-z]{3}\s+\d{2}\s+\d{2}:\d{2})\s*[|\t ]+\s*([A-Z]{3})\s*[|\t ]+\s*([A-Z]{3})\s*[|\t ]+\s*(\d+)\s*[|\t ]+\s*([\d.]+)(?:\s*[|\t ]+\s*(\d+)\s*[|\t ]+\s*([\d.]+))?"
        for m in re.finditer(pattern2, text):
            g = m.groups()
            flight_num = g[0].strip()
            loaded_pcs = g[9]
            
            if loaded_pcs == '0':
                failed_flights.add(flight_num)
                # Normalize flight string to remove extra spaces just in case
                failed_flights.add(re.sub(r'\s+', ' ', flight_num))
                continue
                
            events.append(TrackingEvent(
                flight=flight_num,
                date=g[2].strip(), 
                location=g[5].strip(), 
                status_code="DEP",
                pieces=g[7].strip(),
                weight=g[8].strip(),
                status=f"Departed {flight_num} from {g[5].strip()}",
                remarks=f"Flight {flight_num} to {g[6].strip()}"
            ))
            events.append(TrackingEvent(
                flight=flight_num,
                date=g[4].strip(),
                location=g[6].strip(),
                status_code="ARR",
                pieces=g[7].strip(),
                weight=g[8].strip(),
                status=f"Arrived {flight_num} at {g[6].strip()}",
                remarks=f"Flight {flight_num} from {g[5].strip()}"
            ))
            
        # 2. Parse status history (Table 1)
        event_pattern = r"^([A-Z]{3})\s+([A-Z]{3})\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{2})\s+(\d{2}:\d{2})\s+(\d+)\s+([\d.]+)(.*)$"
        
        for line in text.split('\n'):
            line = line.strip().replace('\xa0', ' ')
            m = re.match(event_pattern, line)
            if m:
                g = m.groups()
                status_code = g[0]
                location = g[1]
                date = f"{g[2]} {g[3]}"
                pieces = g[4]
                weight = g[5]
                trailing = g[6].strip()
                
                flight = None
                remarks = None
                
                if trailing:
                    flight_match = re.search(r"([A-Z]{2,3})\s*(\d{1,4})", trailing, re.IGNORECASE)
                    if flight_match:
                        flight_val = f"{flight_match.group(1)} {flight_match.group(2)}"
                        # Strip flight if it's a known failed flight
                        norm_flight = re.sub(r'\s+', ' ', flight_val)
                        if norm_flight in failed_flights or flight_val in failed_flights:
                            flight = None
                            remarks = trailing
                        else:
                            flight = flight_val
                    else:
                        remarks = trailing
                        
                events.append(TrackingEvent(
                    status_code=status_code,
                    location=location,
                    date=date,
                    pieces=pieces,
                    weight=weight,
                    status=f"Status {status_code}",
                    flight=flight,
                    remarks=remarks
                ))
                
        return events
