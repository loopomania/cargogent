from __future__ import annotations

import re
import sys
import os
import time
from datetime import datetime
from typing import List, Optional

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from .base import AirlineTracker
from .common import normalize_awb
from .proxy_util import get_rotating_proxy, get_proxy_extension
from models import TrackingEvent, TrackingResponse


class AirCanadaTracker(AirlineTracker):
    name = "aircanada"
    main_url = "https://www.aircanada.com/cargo/tracking?awbnb="

    async def track(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        """Offload sync UC/Selenium work to the shared browser executor."""
        return await self.run_sync(self._track_sync, awb, hawb=hawb, **kwargs)

    def _track_sync(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="014")
        awb_fmt = f"{prefix}-{serial}"
        awb_no_dash = f"{prefix}{serial}"
        message = "Success"
        blocked = False
        trace = []
        events: List[TrackingEvent] = []

        from playwright.sync_api import sync_playwright
        import random

        target_url = f"{self.main_url}{awb_fmt}"
        text = ""
        
        if not getattr(self, "proxy", None):
            blocked = True
            message = "A Scraping Browser WSS URI must be provided for Air Canada."
        else:
            trace.append("init_playwright_cdp")
            try:
                with sync_playwright() as p:
                    trace.append("connecting_ws")
                    browser = p.chromium.connect_over_cdp(self.proxy)
                    page = browser.new_page()
                    
                    trace.append("farming_akamai_telemetry_pw")
                    page.goto(target_url, timeout=60000)
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
        
                    # Reload to upgrade Akamai cookie
                    page.reload(timeout=60000)
                    trace.append("akamai_cookies_upgraded_pw")
                    time.sleep(random.uniform(3.0, 5.0)) # Pacing for API render
                    
                    # Wait up to 30s for the tracking content or error to appear
                    deadline = time.time() + 30
                    while time.time() < deadline:
                        text = page.evaluate("document.body.innerText") or ""
                        if (
                            awb_fmt in text or awb_no_dash in text
                            or "Expand all" in text
                            or "piece" in text.lower()
                            or "not found" in text.lower()
                            or "access denied" in text.lower()
                            or "Error code" in text
                        ):
                            break
                        page.wait_for_timeout(1000)

                    # Expand history tree if present
                    if "Expand all" in text:
                        try:
                            page.evaluate("""
                                const btn = Array.from(document.querySelectorAll('button, span, a'))
                                    .find(el => el.innerText && el.innerText.includes('Expand all'));
                                if (btn) btn.click();
                            """)
                            page.wait_for_timeout(2000)
                            trace.append("expanded_history_tree_pw")
                            text = page.evaluate("document.body.innerText") or ""
                        except Exception:
                            pass
                    
                    if text:
                        trace.append(f"page_text_len:{len(text)}")
                    
                    browser.close()
            except Exception as e:
                trace.append(f"driver_error:{str(e)[:40]}")
                message = f"Driver Error: {str(e)[:40]}"

        if not blocked and text:
            if "Access Denied" in text or ("Reference Number" in text and "Security" in text):
                blocked = True
                message = "Bot protection blocked the request."
            else:
                events = self._parse_text_to_events(text)
                if not events:
                    if "not found" in text.lower():
                        message = "AWB not found in Air Canada system."
                    elif "Error code" in text:
                        message = "Air Canada service returned an error."
                    else:
                        message = "No tracking data found in page text."
                else:
                    message = "Successfully loaded tracking data."

        return self._finalize_response(awb_fmt, events, trace, message, blocked)

    def _build_event(self, current_date, status_text, time_text, loc_text, pcs, wt, desc) -> TrackingEvent:
        status_code = "UNKN"
        sl = status_text.lower()
        if "deliver" in sl: status_code = "DLV"
        elif "depart" in sl: status_code = "DEP"
        elif "arriv" in sl: status_code = "ARR"
        elif "accept" in sl or "received" in sl or "dropped off" in sl: status_code = "RCS"
        elif "book" in sl: status_code = "BKD"
        elif "notif" in sl: status_code = "NFD"
        elif "manifest" in sl or "consol" in sl: status_code = "MAN"
        elif "transferred" in sl: status_code = "TRV"

        flight = None
        fm = re.search(r'([A-Z]{2,3}\s*\d{3,4})', desc)
        if fm:
            flight = fm.group(1).replace(" ", "")
            if status_code == "UNKN":
                if "depart" in desc.lower(): status_code = "DEP"
                elif "arriv" in desc.lower(): status_code = "ARR"

        event_date = f"{current_date} {time_text}" if current_date else time_text

        # Clean location to remove parentheses like (ARR) or (DEP)
        loc_clean = re.sub(r'\s*\([^)]*\)', '', loc_text).strip() if loc_text else ""

        return TrackingEvent(
            status_code=status_code,
            status=status_text,
            location=loc_clean,
            date=event_date,
            pieces=pcs,
            weight=wt,
            remarks=desc or status_text,
            flight=flight
        )

    def _parse_text_to_events(self, text: str) -> List[TrackingEvent]:
        events: List[TrackingEvent] = []
        current_date = ""

        # Check if tab-delimited
        if '\t' in text:
            for line in text.split('\n'):
                line = line.strip()
                if not line: continue
                # Accept months up to 9 chars e.g. "April"
                if re.match(r'^[A-Z][a-z]{2,8}\s\d{1,2},\s\d{4}$', line):
                    current_date = line
                    continue
                parts = line.split('\t')
                if len(parts) >= 3 and "Status" not in line and "Time" not in line:
                    st = parts[0].strip()
                    tm = parts[1].strip()
                    loc = parts[2].strip()
                    pc = parts[3].strip() if len(parts) > 3 else ""
                    wt = parts[4].strip() if len(parts) > 4 else ""
                    desc = parts[5].strip() if len(parts) > 5 else ""
                    events.append(self._build_event(current_date, st, tm, loc, pc, wt, desc))
            return events

        # Otherwise parse vertical newline-delimited layout
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        for i in range(len(lines)):
            line = lines[i]
            if re.match(r'^[A-Z][a-z]{2,8}\s\d{1,2},\s\d{4}$', line):
                current_date = line
            elif re.match(r'^\d{2}:\d{2}$', line) and i > 0:
                status_text = lines[i-1]
                time_text = line
                loc_text = lines[i+1] if i+1 < len(lines) else ""
                
                # Collect pieces, weight, description
                pc, wt, desc = "", "", ""
                j = i + 2
                chunk = []
                while j < len(lines):
                    if re.match(r'^[A-Z][a-z]{2,8}\s\d{1,2},\s\d{4}$', lines[j]): break
                    if lines[j] == "View shipping status on": break
                    if j + 1 < len(lines) and re.match(r'^\d{2}:\d{2}$', lines[j+1]): break
                    if lines[j] in ["Status", "Time", "Location", "Pieces", "Weight", "Description"]: break
                    chunk.append(lines[j])
                    j += 1
                
                if len(chunk) >= 1:
                    desc = chunk[-1]
                    if len(chunk) >= 3:
                        pc = chunk[0]
                        wt = chunk[1]
                    elif len(chunk) == 2:
                        if "pc" in chunk[0].lower(): pc = chunk[0]
                        else: wt = chunk[0]
                        
                if "Status" not in status_text and "Time" not in status_text:
                    events.append(self._build_event(current_date, status_text, time_text, loc_text, pc, wt, desc))

        return events

    def _finalize_response(self, awb_fmt, events, trace, message="Success", blocked=False):
        status, flight = None, None
        origin, destination = None, None

        if events:
            def parse_dt(e):
                try:
                    return datetime.strptime(e.date, "%b %d, %Y %H:%M")
                except:
                    return datetime.min

            unique_events = []
            seen = set()
            for e in events:
                ek = (e.status_code, e.location, e.date, e.flight)
                if ek not in seen:
                    seen.add(ek)
                    unique_events.append(e)

            events = unique_events
            events.sort(key=parse_dt)

            dep_events = [e for e in events if e.status_code == "DEP"]
            arr_events = [e for e in events if e.status_code == "ARR"]

            origin = dep_events[0].location if dep_events else (events[0].location if events else None)
            destination = arr_events[-1].location if arr_events else (events[-1].location if events else None)
            status = events[-1].status_code if events else "UNKN"
            flight = next((e.flight for e in reversed(events) if e.flight), None)

        return TrackingResponse(
            airline=self.name, awb=awb_fmt, origin=origin, destination=destination,
            status=status, flight=flight, events=events, message=message, blocked=blocked,
            raw_meta={"trace": trace, "event_count": len(events)},
        )
