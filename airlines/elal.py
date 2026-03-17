from __future__ import annotations

import asyncio
import json
import re
import os
import sys
from typing import List
from datetime import datetime

from playwright.async_api import async_playwright, Response

from .base import AirlineTracker
from .common import normalize_awb, is_bot_blocked_html
from models import TrackingResponse, TrackingEvent


class ElAlTracker(AirlineTracker):
    name = "elal"
    main_url = "https://www.elal.com/en/Cargo/Pages/Online-Tracking.aspx"

    async def track(self, awb: str) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="114")
        awb_fmt = f"{prefix}-{serial}"
        message = "Success"
        blocked = False
        events: List[TrackingEvent] = []
        origin = None
        destination = None
        trace = []
        ajax_data = []

        # Only use Xvfb on Linux
        if sys.platform == "linux":
            os.environ["DISPLAY"] = ":99"
            trace.append("linux_detected_setting_display")

        proxy_config = None
        if self.proxy:
            match = re.search(r'https?://(?:([^:@]+):([^@]*)@)?([^:]+):(\d+)', self.proxy)
            if match:
                user, password, host, port = match.groups()
                proxy_config = {
                    "server": f"http://{host}:{port}",
                    "username": user,
                    "password": password,
                }

        # Strategy 0: Legacy URL (fast and simple, often more stable)
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=True, 
                    proxy=proxy_config,
                    args=["--no-sandbox", "--disable-dev-shm-usage"]
                )
                
                # Use a specific Mobile User-Agent
                mobile_ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
                context = await browser.new_context(
                    viewport={'width': 390, 'height': 844},
                    user_agent=mobile_ua,
                    is_mobile=True,
                    has_touch=True
                )
                
                # Basic stealth
                await context.add_init_script("Object.defineProperty(navigator, 'webdriver', { get: () => undefined });")
                
                page = await context.new_page()
                legacy_url = f"https://www.elalextra.net/info/awb.asp?aid={prefix}&awb={serial}&Lang=Eng"
                trace.append(f"strategy_0_navigating_legacy_mobile")
                
                # Introduce a small delay to simulate human interaction if needed, though direct nav usually fine
                await page.goto(legacy_url, timeout=30000, wait_until="domcontentloaded")
                await asyncio.sleep(2) # Give it a moment to render any JS challenges
                
                legacy_text = await page.evaluate("document.body.innerText")
                await browser.close()
                
                if legacy_text:
                    trace.append(f"legacy_text_len:{len(legacy_text)}")
                    events = self._parse_legacy_text(legacy_text)
                    if events:
                        trace.append(f"independent_legacy_success:{len(events)}")
                        return self._finalize_response(awb_fmt, events, trace)
                    else:
                        trace.append("legacy_parse_yielded_no_events")
                        # Debug info
                        with open("/tmp/elal_legacy.txt", "w") as f:
                            f.write(legacy_text)
                else:
                    trace.append("legacy_text_empty")
        except Exception as le:
            trace.append(f"indep_legacy_err:{str(le)[:40]}")


        # Strategy Loop: Try main site configurations
        success = False
        for attempt in range(3):
            browser = None
            try:
                async with async_playwright() as p:
                    # Strategy: Headless is often more stable in problematic environments
                    is_mac = sys.platform == "darwin"
                    browser = await p.chromium.launch(
                        headless=is_mac, 
                        proxy=proxy_config,
                        args=["--no-sandbox", "--disable-dev-shm-usage"]
                    )
                    trace.append(f"attempt_{attempt}_launched_headless_{is_mac}")
                    
                    context = await browser.new_context(
                        viewport={'width': 1280, 'height': 720},
                        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                    )
                    
                    if attempt < 2:
                        await context.add_init_script("""
                            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                            window.navigator.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
                        """)
                    
                    page = await context.new_page()
                    
                    # Intercept AJAX
                    async def handle_response(response):
                        if "getStations" in response.url and response.status == 200:
                            try:
                                data = await response.json()
                                if isinstance(data, list):
                                    ajax_data.extend(data)
                                    trace.append(f"intercepted:{len(data)}")
                            except: pass
                    
                    page.on("response", handle_response)
                    
                    # Navigate
                    try:
                        await page.goto(self.main_url, wait_until="networkidle", timeout=60000)
                        trace.append("navigated_main")
                    except Exception as ne:
                        trace.append(f"nav_err:{str(ne)[:30]}")
                        # Fallback to simple load
                        try: await page.goto(self.main_url, wait_until="domcontentloaded", timeout=30000)
                        except: pass
                    
                    # Cookie acceptance
                    try:
                        accept_btn = await page.query_selector("#onetrust-accept-btn-handler")
                        if accept_btn:
                            await accept_btn.click()
                            await asyncio.sleep(2)
                    except: pass

                    # Form Interaction
                    try:
                        # Wait a bit for iframes to populate
                        await asyncio.sleep(5)
                        
                        tracking_frame = None
                        for frame in page.frames:
                            if "iframeTracking" in (frame.name or "") or "AIR2.aspx" in frame.url:
                                tracking_frame = frame
                                break
                        
                        target = tracking_frame if tracking_frame else page
                        
                        # Specific selectors found: AWBID, AWBNumber, ImageButton1
                        prefix_input = await target.wait_for_selector("#AWBID, input.txtTrackPrefix, #txtAwbPrefix", timeout=20000)
                        if prefix_input:
                            await prefix_input.fill(prefix)
                            serial_input = await target.wait_for_selector("#AWBNumber, input.txttrackAWBNum, #txtAwbNum", timeout=10000)
                            if serial_input:
                                await serial_input.fill(serial)
                                btn = await target.query_selector("#ImageButton1, button.btnOnlineTracking, #btnTrack")
                                if btn:
                                    try:
                                        await btn.click()
                                        trace.append("track_clicked_specific")
                                    except: pass
                                    
                                    # Wait for AJAX or success indicator
                                    for _ in range(10):
                                        if ajax_data: 
                                            success = True
                                            break
                                        await asyncio.sleep(1)
                                    
                                    if not ajax_data:
                                        try:
                                            manual_data = await target.evaluate(f"async () => {{ try {{ const r = await fetch('AIR2.aspx/getStations?awbTrackNum={serial}&airlineId={prefix}'); return await r.json(); }} catch(e) {{ return null; }} }}")
                                            if manual_data and isinstance(manual_data, list):
                                                ajax_data.extend(manual_data)
                                                success = True
                                                trace.append("manual_fetch_in_frame_success")
                                        except: pass
                    except Exception as fe:
                        trace.append(f"form_err:{str(fe)[:30]}")

                    # Strategy 2: Legacy fallback if AJAX failed
                    if not success and not ajax_data:
                        trace.append("try_legacy")
                        legacy_url = f"https://www.elalextra.net/info/awb.asp?aid={prefix}&awb={serial}&Lang=Eng"
                        try:
                            await page.goto(legacy_url, timeout=30000, wait_until="domcontentloaded")
                            await asyncio.sleep(3)
                            legacy_text = await page.evaluate("document.body.innerText")
                            if legacy_text:
                                events = self._parse_legacy_text(legacy_text)
                                if events: 
                                    success = True
                                    trace.append("legacy_success")
                        except Exception as le:
                            trace.append(f"legacy_err:{str(le)[:30]}")

                    if success or ajax_data:
                        break # Out of try block
                    
            except Exception as e:
                trace.append(f"attempt_{attempt}_fail:{str(e)[:40]}")
            finally:
                if browser:
                    try: await browser.close()
                    except: pass
            
            if success or ajax_data:
                break
            await asyncio.sleep(2)

        if ajax_data:
            events = self._parse_ajax_data(ajax_data)
            trace.append("ajax_events_parsed")

        return self._finalize_response(awb_fmt, events, trace, message, blocked)

    def _finalize_response(self, awb_fmt, events, trace, message="Success", blocked=False):
        status, flight = None, None
        origin = None
        destination = None
        
        if events:
            # Sort chronologically Oldest to Latest
            def parse_dt(e):
                try:
                    # Format "17 Mar 26 15:15" or similar
                    return datetime.strptime(e.date, "%d %b %y %H:%M")
                except:
                    return datetime.min

            events.sort(key=parse_dt)
            
            # Map Origin/Destination correctly
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

            # Final status/flight
            status = events[-1].status if events else "UNKN"
            flight = next((e.flight for e in reversed(events) if e.flight), None)

        return TrackingResponse(
            airline=self.name, awb=awb_fmt, origin=origin, destination=destination,
            status=status, flight=flight, events=events, message=message, blocked=blocked,
            raw_meta={"trace": trace},
        )

    def _parse_ajax_data(self, data: list) -> List[TrackingEvent]:
        events: List[TrackingEvent] = []
        if not data or not isinstance(data, list): return events
        
        def s(val): return str(val).strip() if val is not None else None
        
        # El Al AJAX Status Mapper
        # B = Booked, R = Received from Shipper, E = Expected / Exited / Departed?, A = Arrived?
        # Based on user feedback, codes are mixed. Let's try to map logically.
        def map_code(raw_type):
            if not raw_type: return "UNKN"
            t = raw_type.upper()
            if t == "B": return "BKD"
            if t == "R": return "RCS"
            if t == "E": return "DEP" # Exited / Departed
            if t == "A": return "ARR" # Arrived
            return t if len(t) == 3 else "UNKN"

        for item in data:
            raw_date = s(item.get('PointDateStr','')) # e.g. "17-Mar-26"
            raw_time = s(item.get('DepTime',''))      # e.g. "15:15"
            
            # Standardize date to "DD MMM YY HH:mm" for internal sorting
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
        
        # New pattern for standard event rows:
        # FOH     TLV     23 Feb 26  22:55        3       11.0    
        # RCF     JFK     25 Feb 26  07:15        23      569.0   LY 001
        # NFD     JFK     25 Feb 26  08:09        23      569.0                   DSV AIR SEA INC
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
                    if re.match(r"^([A-Z]{2,3})\s*(\d{3,4})$", trailing):
                        flight = trailing
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
        
        # Pattern 2: Multi-pipe/tab/space format (older style)
        if not events:
            pattern2 = r"(LY\s+\d+)\s*[|\t ]+\s*[^|\t\n]+[|\t ]+\s*([A-Z])\s*[|\t ]+(\d{1,2}\s+[A-Za-z]{3}\s+\d{2}\s+\d{2}:\d{2})\s*[|\t ]+\s*([A-Z])\s*[|\t ]+(\d{1,2}\s+[A-Za-z]{3}\s+\d{2}\s+\d{2}:\d{2})\s*[|\t ]+\s*([A-Z]{3})\s*[|\t ]+\s*([A-Z]{3})\s*[|\t ]+\s*(\d+)\s*[|\t ]+\s*([\d.]+)"
            for m in re.finditer(pattern2, text):
                g = m.groups()
                events.append(TrackingEvent(
                    flight=g[0],
                    date=g[2].strip(), 
                    location=g[5].strip(), 
                    status_code="DEP" if g[1] == "E" else g[1],
                    pieces=g[7].strip(),
                    weight=g[8].strip(),
                    status=f"Departed {g[0]} from {g[5]}",
                    remarks=f"Flight {g[0]} to {g[6]}"
                ))
                events.append(TrackingEvent(
                    flight=g[0],
                    date=g[4].strip(),
                    location=g[6].strip(),
                    status_code="ARR" if g[3] == "A" else g[3],
                    pieces=g[7].strip(),
                    weight=g[8].strip(),
                    status=f"Arrived {g[0]} at {g[6]}",
                    remarks=f"Flight {g[0]} from {g[5]}"
                ))
                
        return events
