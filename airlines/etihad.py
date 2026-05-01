from __future__ import annotations

import json
import re
import time
from typing import List
from datetime import datetime

from .base import AirlineTracker
from .common import normalize_awb
from .proxy_util import get_rotating_proxy
from models import TrackingEvent, TrackingResponse

class EtihadTracker(AirlineTracker):
    name = "etihad"
    base_url = "https://www.etihadcargo.com/en/e-services/shipment-tracking"

    async def track(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        """Offload sync UC/Selenium work to the shared browser executor."""
        return await self.run_sync(self._track_sync, awb, hawb=hawb, **kwargs)

    def _track_sync(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        import sys
        prefix, serial = normalize_awb(awb, default_prefix="607")
        awb_fmt = f"{prefix}-{serial}"
        awb_clean = f"{prefix}{serial}"
        
        self.tmp_origin = None
        self.tmp_destination = None

        message = "Success"
        blocked = False
        events: List[TrackingEvent] = []
        trace: List[str] = []
        api_payloads = []

        from playwright.sync_api import sync_playwright
        import random
        
        source_url = f"{self.base_url}?awb={awb_clean}"
        trace.append(f"navigating:{source_url[-50:]}")
        
        if not getattr(self, "proxy", None):
            blocked = True
            message = "A proxy must be provided for Etihad."
        else:
            try:
                with sync_playwright() as p:
                    proxy_config = None
                    if self.proxy.startswith("wss://") or self.proxy.startswith("ws://"):
                        browser = p.chromium.connect_over_cdp(self.proxy)
                        context = browser.contexts[0] if browser.contexts else browser.new_context(ignore_https_errors=True)
                        page = context.new_page()
                    else:
                        m = re.search(r'https?://(?:([^:@]+):([^@]*)@)?([^:]+):(\d+)', self.proxy)
                        if m:
                            user, password, host, port = m.groups()
                            proxy_config = {
                                "server": f"http://{host}:{port}",
                                "username": user,
                                "password": password,
                            }
                        browser = p.chromium.launch(headless=True, proxy=proxy_config)
                        context = browser.new_context(ignore_https_errors=True)
                        page = context.new_page()
                    
                    def handle_response(response):
                        url = response.url.lower()
                        if "track" in url or "shipment" in url or "awb" in url:
                            try:
                                body = response.json()
                                if body and isinstance(body, (dict, list)):
                                    # Very broad capture
                                    api_payloads.append((response.url, body))
                                    trace.append(f"api_captured:{response.url[-60:]}")
                            except Exception:
                                pass
                    
                    page.on("response", handle_response)
                    
                    trace.append("farming_telemetry_pw")
                    page.goto(source_url, timeout=60000)
                    time.sleep(random.uniform(2.5, 4.0))
                    
                    try:
                        page.mouse.move(random.randint(100, 500), random.randint(100, 500))
                        page.mouse.wheel(delta_x=0, delta_y=random.randint(100, 400))
                        time.sleep(random.uniform(1.0, 2.0))
                    except Exception as act_e:
                        trace.append(f"telemetry_fail:{str(act_e)[:20]}")
                        
                    # Etihad SPA. Let it buffer
                    end_time = time.time() + 15
                    while time.time() < end_time and not api_payloads:
                        page.wait_for_timeout(1000)
                        
                    text = page.evaluate("document.documentElement.innerText") or ""
                    
                    if not api_payloads:
                        if "access denied" in text.lower() or "blocked" in text.lower() or "attention required" in text.lower():
                            blocked = True
                            message = "Akamai / bot protection blocked the request."
                            trace.append("akamai_blocked")
                        else:
                            message = "Tracking page loaded but API call not captured."
                            # Fallback parse text
                            events.extend(self._parse_fallback_text(text))
                    else:
                        for idx, (url, payload) in enumerate(api_payloads):
                            parsed = self._parse_api_payload(payload)
                            events.extend(parsed)
                        if events:
                            trace.append(f"parsed_api_events:{len(events)}")
                            
                    browser.close()
            except Exception as e:
                message = f"Etihad tracking failed: {e}"
                blocked = True
                trace.append(f"exception:{str(e)[:80]}")

        # Deduplicate
        unique_events = []
        seen = set()
        for e in events:
            key = f"{e.status_code}-{e.date}-{e.location}"
            if key not in seen:
                seen.add(key)
                unique_events.append(e)
        events = unique_events

        origin, destination, status, flight = None, None, None, None
        if events:
            # Try parsing datetime
            try:
                events.sort(key=lambda x: datetime.strptime(x.date, "%d %b %Y %H:%M") if "%" not in x.date else x.date)
            except:
                pass

            dep_events = [e for e in events if e.status_code == "DEP"]
            arr_events = [e for e in events if e.status_code == "ARR"]
            
            if dep_events: origin = dep_events[0].location
            else: origin = next((e.location for e in events if e.location), None)
            if arr_events: destination = arr_events[-1].location
            else: destination = next((e.location for e in reversed(events) if e.location), None)

            if getattr(self, "tmp_origin", None): origin = self.tmp_origin
            if getattr(self, "tmp_destination", None): destination = self.tmp_destination

            status = events[-1].status_code if events else "UNKN"
            flight = next((e.flight for e in reversed(events) if e.flight), None)

        if not events and not blocked and message == "Success":
            message = "No tracking events found"

        return TrackingResponse(
            airline=self.name, awb=awb_fmt, origin=origin, destination=destination,
            status=status, flight=flight, events=events, message=message, blocked=blocked,
            raw_meta={"source_url": source_url, "event_count": len(events), "trace": trace},
        )

    def _parse_api_payload(self, payload) -> List[TrackingEvent]:
        events: List[TrackingEvent] = []
        
        data = payload
        items = []
        if isinstance(data, dict):
            if "response" in data and "awb" in data["response"]:
                awb_data = data["response"]["awb"]
                if "origin" in awb_data: self.tmp_origin = awb_data["origin"]
                if "destination" in awb_data: self.tmp_destination = awb_data["destination"]
                
                # First parse the explicit routing lines to capture ATD/ATA and actual legs
                routing = awb_data.get("routing", {}).get("line", [])
                if isinstance(routing, dict): routing = [routing]
                for line in routing:
                    if not isinstance(line, dict): continue
                    flight = line.get("flightNum")
                    pieces = str(line.get("pieces") or "")
                    weight = str(line.get("weight") or "")
                    
                    origin = line.get("flightOrigin")
                    dep_date = line.get("departureDate")
                    dep_time = line.get("departureTime", "")
                    dep_type = line.get("typeOfDepartureTime", "")
                    
                    dest = line.get("flightDest")
                    arr_date = line.get("arrivalDate")
                    arr_time = line.get("arrivalTime", "")
                    arr_type = line.get("typeOfArrivalTime", "")
                    
                    if origin and dep_date:
                        date_str = f"{dep_date} {dep_time}".strip()
                        if dep_type == "A":
                            events.append(TrackingEvent(status_code="DEP", status="Departed", location=str(origin)[:3].upper(), date=date_str, flight=str(flight) if flight else None, pieces=pieces, weight=weight, remarks="", source="etihad"))
                        else:
                            events.append(TrackingEvent(status_code="DEP", status="Departed (Estimated)", location=str(origin)[:3].upper(), date=None, estimated_date=date_str, flight=str(flight) if flight else None, pieces=pieces, weight=weight, remarks="Estimated", source="etihad"))
                        
                    if dest and arr_date:
                        date_str = f"{arr_date} {arr_time}".strip()
                        if arr_type == "A":
                            events.append(TrackingEvent(status_code="ARR", status="Arrived", location=str(dest)[:3].upper(), date=date_str, flight=str(flight) if flight else None, pieces=pieces, weight=weight, remarks="", source="etihad"))
                        else:
                            events.append(TrackingEvent(status_code="ARR", status="Arrived (Estimated)", location=str(dest)[:3].upper(), date=None, estimated_date=date_str, flight=str(flight) if flight else None, pieces=pieces, weight=weight, remarks="Estimated", source="etihad"))

                segments = awb_data.get("segments", {})
                if isinstance(segments, dict) and "segment" in segments:
                    items = segments["segment"]
                elif isinstance(segments, list):
                    items = segments
            
            if not items:
                for key in ("trackingEvents", "shipmentEvents", "history", "events", "data", "result"):
                    if key in data:
                        val = data[key]
                        items = val if isinstance(val, list) else [val]
                        break
                else:
                    if not isinstance(data.get("response"), dict):
                        items = [data]
        elif isinstance(data, list):
            items = data

        for item in reversed(items):
            if not isinstance(item, dict):
                continue
                
            status_code = item.get("statusCode") or item.get("status") or item.get("eventCode")
            if not status_code:
                desc = item.get("statusDescription", "").lower()
                if "delivered" in desc: status_code = "DLV"
                elif "arrived" in desc: status_code = "ARR"
                elif "departed" in desc: status_code = "DEP"
                elif "accepted" in desc: status_code = "RCS"
                elif "booked" in desc: status_code = "BKD"
                else: status_code = "UNKN"
                
            location = item.get("station") or item.get("location") or item.get("origin") or item.get("airportCode")
            
            date = item.get("eventDate") or item.get("date") or item.get("localTime")
            flight = item.get("flightNo") or item.get("flightNumber")
            pieces = str(item.get("pieces") or item.get("statedPieces") or "")
            weight = str(item.get("weight") or item.get("statedWeight") or "")
            remarks = str(item.get("statusDescription") or item.get("remarks") or "")

            if status_code and date:
                sc = str(status_code)[:10].upper()
                if sc == "DELIVERED": sc = "DLV"
                if sc == "ARRIVED": sc = "ARR"
                if sc == "DEPARTED": sc = "DEP"
                if sc == "ACCEPTED": sc = "RCS"
                if sc == "BOOKED": sc = "BKD"
                
                st = remarks or sc
                if sc == "ARR": st = "Arrived"
                elif sc == "DEP": st = "Departed"
                elif sc == "RCS": st = "Received"
                elif sc == "DLV": st = "Delivered"
                elif sc == "BKD": st = "Booked"
                elif sc == "RCF": st = "Received from flight"

                events.append(TrackingEvent(
                    status_code=sc,
                    status=st,
                    location=str(location)[:3].upper() if location else None,
                    date=str(date),
                    flight=str(flight) if flight else None,
                    pieces=pieces,
                    weight=weight,
                    remarks=remarks[:200],
                    source="etihad"
                ))
        return events

    def _parse_fallback_text(self, text: str) -> List[TrackingEvent]:
        events: List[TrackingEvent] = []
        # General fallback if API interception fails but DOM has rendered typical lines
        for line in text.split('\n'):
            line = line.strip()
            # typical line e.g. "RCS AUH 24-Oct-2023 10:00 10 1500"
            m = re.search(r'([A-Z]{3})\s+([A-Z]{3})\s+(\d{1,2}[\s/\-][A-Za-z]{3}[\s/\-]\d{2,4}\s+\d{2}:\d{2})', line)
            if m:
                status_code, loc, date = m.groups()
                events.append(TrackingEvent(
                    status_code=status_code,
                    location=loc,
                    date=date,
                    pieces=None,
                    weight=None,
                    remarks="Parsed from DOM"
                ))
        return events
