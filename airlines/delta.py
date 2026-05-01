"""
Delta Cargo tracker — undetected-chromedriver + CDP network interception.

KEY STRATEGY:
- Navigate to trackShipment page with AWB in URL
- Provide residential proxy with extension auth (bypasses Akamai WAF)
- Intercept Angular's GET request to /trackAwb using Chrome Performance logs
- Parse the JSON payload
"""

from __future__ import annotations

import json
import re
import time
from typing import List

import undetected_chromedriver as uc

from .base import AirlineTracker
from .common import normalize_awb, is_bot_blocked_html
from .proxy_util import get_rotating_proxy, get_proxy_extension
from models import TrackingEvent, TrackingResponse

class DeltaTracker(AirlineTracker):
    name = "delta"
    base_url = "https://www.deltacargo.com/Cargo/trackShipment"

    async def track(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        """Offload sync UC/Selenium work to the shared browser executor."""
        return await self.run_sync(self._track_sync, awb, hawb=hawb, **kwargs)

    def _track_sync(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        import sys
        
        print("DELTA SYNC START", file=sys.stderr)
        prefix, serial = normalize_awb(awb, default_prefix="006")
        awb_fmt = f"{prefix}-{serial}"
        awb_clean = f"{prefix}{serial}"

        message = "Success"
        blocked = False
        events: List[TrackingEvent] = []
        trace: List[str] = []
        api_payloads = []

        from playwright.sync_api import sync_playwright
        import random
        
        source_url = f"{self.base_url}?awbNumber={awb_clean}"
        trace.append(f"navigating:{source_url[-50:]}")
        
        if not getattr(self, "proxy", None):
            blocked = True
            message = "A proxy must be provided for Delta."
        else:
            try:
                with sync_playwright() as p:
                    print("LAUNCHING PLAYWRIGHT CDI", file=sys.stderr)
                    
                    proxy_config = None
                    if self.proxy.startswith("wss://") or self.proxy.startswith("ws://"):
                        browser = p.chromium.connect_over_cdp(self.proxy)
                        context = browser.contexts[0] if browser.contexts else browser.new_context(ignore_https_errors=True)
                        page = context.new_page()
                    else:
                        import re
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
                    
                    # Set up response interceptor
                    def handle_response(response):
                        if "trackAwb" in response.url:
                            trace.append(f"api_captured:{response.url[-60:]}")
                            try:
                                body = response.json()
                                api_payloads.append(body)
                            except Exception:
                                pass
                    
                    page.on("response", handle_response)
                    
                    trace.append("farming_akamai_telemetry_pw")
                    page.goto(source_url, timeout=60000)
                    time.sleep(random.uniform(2.5, 4.0)) # bm_sz pacing
                    
                    try:
                        page.mouse.move(random.randint(100, 500), random.randint(100, 500))
                        for _ in range(3):
                            page.mouse.move(random.randint(50, 400), random.randint(50, 400))
                            time.sleep(random.uniform(0.3, 1.2))
                        
                        page.mouse.wheel(delta_x=0, delta_y=random.randint(100, 400))
                        time.sleep(random.uniform(1.0, 2.0))
                    except Exception as act_e:
                        trace.append(f"telemetry_fail:{str(act_e)[:20]}")
                        
                    # Delta Angular logic triggers internally. Wait for API to resolve natively.
                    end_time = time.time() + 15
                    while time.time() < end_time and not api_payloads:
                        page.wait_for_timeout(1000)
                        
                    # Evaluate blocks
                    text = page.evaluate("document.body.innerText") or ""
                    
                    if not api_payloads:
                        if "access denied" in text.lower():
                            blocked = True
                            message = "Akamai / bot protection blocked the request."
                            trace.append("akamai_blocked")
                        else:
                            message = "Tracking page loaded but API call not captured."
                    else:
                        for payload in api_payloads:
                            parsed = self._parse_api_payload(payload)
                            events.extend(parsed)
                            if not parsed:
                                msgs = payload.get("messages", [])
                                for msg in msgs:
                                    if msg.get("code") == "-213":
                                        message = "AWB not found in Delta system."
                                        trace.append("delta_not_found_-213")
                        if events:
                            trace.append(f"parsed_api_events:{len(events)}")
                            
                    browser.close()
            except Exception as e:
                message = f"Delta tracking failed: {e}"
                blocked = True
                trace.append(f"exception:{str(e)[:80]}")

        origin, destination, status, flight = None, None, None, None
        if events:
            locs = [e.location for e in events if e.location and len(e.location) == 3]
            if locs:
                origin = locs[0]
                destination = locs[-1]
            status = events[-1].status_code
            flight = next((e.flight for e in reversed(events) if e.flight), None)

        return TrackingResponse(
            airline=self.name, awb=awb_fmt, origin=origin, destination=destination,
            status=status, flight=flight, events=events, message=message, blocked=blocked,
            raw_meta={"source_url": source_url, "event_count": len(events), "trace": trace},
        )

    def _parse_api_payload(self, payload) -> List[TrackingEvent]:
        events: List[TrackingEvent] = []
        data = payload.get("data", payload)
        if not data:
            return events
            
        if isinstance(data, dict) and "trackShipment" in data:
            data = data["trackShipment"]

        items = []
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            for key in ("history", "trackingInfo", "TrackingInfo", "events", "milestones", "legs",
                        "shipmentEvents", "awbEvents", "items", "result"):
                if key in data:
                    val = data[key]
                    items = val if isinstance(val, list) else [val]
                    break
            else:
                items = [data]

        import re
        for shipment in reversed(items):
            if not isinstance(shipment, dict):
                continue
                
            history_items = shipment.get("history")
            if not history_items:
                history_items = [shipment] # fallback if it was already flattened
                
            global_pieces = str(shipment.get("pieces") or shipment.get("quantity") or "")
            global_weight = str(shipment.get("weight") or "")
            
            for item in reversed(history_items):
                if not isinstance(item, dict):
                    continue
                    
                activity = item.get("activity", "")
                clean_activity = re.sub(r'<[^>]+>', '', activity).strip()
                
                status_code = item.get("statusCode") or item.get("status") or item.get("milestoneCode") or item.get("eventCode")
                if not status_code:
                    act_lower = clean_activity.lower()
                    if "delivered" in act_lower: status_code = "DLV"
                    elif "arrived" in act_lower: status_code = "ARR"
                    elif "departed" in act_lower: status_code = "DEP"
                    elif "ready for customer" in act_lower: status_code = "NFD"
                    elif "checked in" in act_lower or "accepted" in act_lower: status_code = "RCS"
                    elif "booked" in act_lower: status_code = "BKD"
                    else: status_code = "UNKN"
                    
                location = item.get("origin") or item.get("location") or item.get("stationCode")
                
                date = item.get("date", "")
                if item.get("localTime"):
                    date = f"{date} {item['localTime']}".strip()
                    
                flight = item.get("flightNo") or item.get("flightNumber")
                
                pieces = str(item.get("pieces") or global_pieces)
                if not pieces and clean_activity:
                    match = re.search(r'^(\d+)\s+pieces', clean_activity, re.IGNORECASE)
                    if match:
                        pieces = match.group(1)
                        
                weight = str(item.get("weight") or global_weight)
                remarks = item.get("remarks") or clean_activity

                events.append(TrackingEvent(
                    status_code=str(status_code)[:10],
                    location=str(location)[:3].upper() if location else None,
                    date=str(date),
                    flight=str(flight) if flight else None,
                    pieces=pieces,
                    weight=weight,
                    remarks=str(remarks)[:200],
                ))
        return events
