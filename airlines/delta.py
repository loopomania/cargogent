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

        options = uc.ChromeOptions()
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--disable-gpu")
        # Enable CDP performance logging to capture Network payloads
        options.set_capability("goog:loggingPrefs", {"performance": "ALL"})
        
        if self.proxy:
            rotated_proxy = get_rotating_proxy(self.proxy)
            ext_path = get_proxy_extension(rotated_proxy, f"/tmp/proxy_ext_{self.name}")
            if ext_path:
                options.add_argument(f"--load-extension={ext_path}")
                trace.append("using_proxy_extension")
                print("PROXY EXTENSION ADDED", file=sys.stderr)
            else:
                options.add_argument(f"--proxy-server={rotated_proxy}")

        source_url = f"{self.base_url}?awbNumber={awb_clean}"
        trace.append(f"navigating:{source_url[-50:]}")
        
        driver = None
        try:
            print("LAUNCHING DRIVER", file=sys.stderr)
            driver = uc.Chrome(options=options, headless=False, use_subprocess=True, version_main=146)
            print("DRIVER LAUNCHED", file=sys.stderr)
            driver.set_page_load_timeout(30)
            
            print("GETTING URL", file=sys.stderr)
            driver.get(source_url)
            print("URL GOT", file=sys.stderr)
            
            # Wait up to 15s for the page to load, evaluate Akamai, and auto-fire trackAwb
            end_time = time.time() + 15
            found_api = False
            while time.time() < end_time and not found_api:
                # Poll logs for trackAwb URL
                logs = driver.get_log("performance")
                for entry in logs:
                    try:
                        log = json.loads(entry["message"])["message"]
                        if log["method"] == "Network.responseReceived":
                            params = log.get("params", {})
                            resp_url = params.get("response", {}).get("url", "")
                            if "trackAwb" in resp_url:
                                trace.append(f"api_captured:{resp_url[-60:]}")
                                req_id = params.get("requestId")
                                # Extract Body using CDP command
                                body_data = driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": req_id})
                                body_str = body_data.get("body", "")
                                if body_str:
                                    api_payloads.append(json.loads(body_str))
                                    found_api = True
                    except Exception as loop_e:
                        pass
                
                if not found_api:
                    time.sleep(1)

            html = driver.page_source
            page_len = len(html)

            # If no API captured, check if we're bot-blocked
            if not api_payloads:
                if (is_bot_blocked_html(html) or "access denied" in html.lower()) and page_len < 3000:
                    blocked = True
                    message = "Akamai / bot protection blocked the request."
                    trace.append(f"akamai_blocked_len:{page_len}")
                else:
                    trace.append(f"page_loaded_no_api_len:{page_len}")
                    message = "Tracking page loaded but API call not captured."
            else:
                for payload in api_payloads:
                    parsed = self._parse_api_payload(payload)
                    events.extend(parsed)
                    # Check for Delta-specific "not found" message
                    if not parsed:
                        msgs = payload.get("messages", [])
                        for msg in msgs:
                            if msg.get("code") == "-213":
                                message = "AWB not found in Delta system."
                                trace.append("delta_not_found_-213")
                if events:
                    trace.append(f"parsed_api_events:{len(events)}")

        except Exception as exc:
            message = f"Delta tracking failed: {exc}"
            blocked = True
            trace.append(f"exception:{str(exc)[:80]}")
        finally:
            if driver:
                try:
                    driver.quit()
                except Exception:
                    pass

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
