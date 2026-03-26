"""
Delta Cargo tracker — Playwright + Residential Proxy implementation.

KEY STRATEGY (verified working in production):
- Navigate to trackShipment page with AWB in URL
- The Angular app auto-fires a GET request to /Cargo/data/shipment/trackAwb
- Intercept that response via page.on("response")
- Parse the JSON payload

The residential proxy allows the page to load (Akamai passes),
and the Angular app's own GET call inherits the session, also passing.
"""

from __future__ import annotations

import asyncio
import json
import re
import os
from typing import List

from playwright.async_api import async_playwright, Response

from .base import AirlineTracker
from .common import normalize_awb, is_bot_blocked_html
from .proxy_util import get_rotating_proxy
from models import TrackingEvent, TrackingResponse


class DeltaTracker(AirlineTracker):
    name = "delta"
    base_url = "https://www.deltacargo.com/Cargo/trackShipment"

    async def track(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="006")
        awb_fmt = f"{prefix}-{serial}"
        awb_clean = f"{prefix}{serial}"

        message = "Success"
        blocked = False
        events: List[TrackingEvent] = []
        trace: List[str] = []

        # Use display :99 for Linux (Xvfb) but don't force on Mac
        if os.name != "nt" and os.uname().sysname == "Linux":
            os.environ["DISPLAY"] = ":99"
            trace.append("set_display_99_linux")

        proxy_config = None
        if self.proxy:
            # Request rotated IP for the scraping request
            specialized_proxy = get_rotating_proxy(self.proxy)
            
            m = re.search(r'https?://(?:([^:@]+):([^@]*)@)?([^:]+):(\d+)', specialized_proxy)
            if m:
                user, password, host, port = m.groups()
                proxy_config = {
                    "server": f"http://{host}:{port}",
                    "username": user,
                    "password": password,
                }
                trace.append(f"using_playwright_proxy:{host}")

        source_url = f"{self.base_url}?awbNumber={awb_clean}"

        is_linux = os.name != "nt" and os.uname().sysname == "Linux"
        api_payloads: list = []
        api_response_received = asyncio.Event()

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=not is_linux,
                    proxy=proxy_config,
                    args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
                )

                context = await browser.new_context(
                    user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
                    viewport={"width": 1440, "height": 900},
                )
                await context.add_init_script(
                    "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
                )

                page = await context.new_page()

                async def on_response(response: Response):
                    url = response.url
                    if "trackAwb" in url and response.status == 200:
                        try:
                            body = await response.body()
                            data = json.loads(body.decode("utf-8", errors="ignore"))
                            api_payloads.append(data)
                            trace.append(f"api_captured:{url[-60:]}")
                            api_response_received.set()
                        except Exception as exc:
                            trace.append(f"api_parse_error:{str(exc)[:60]}")

                page.on("response", on_response)

                trace.append(f"navigating:{source_url[-50:]}")
                await page.goto(source_url, timeout=60000, wait_until="domcontentloaded")

                # Wait for Akamai challenge to resolve and Angular to fire the API call.
                # The API call is fired by the Angular app automatically when the page detects 
                # the awbNumber in the URL. We wait up to 30s for it.
                try:
                    await asyncio.wait_for(api_response_received.wait(), timeout=30.0)
                    trace.append("api_event_received")
                except asyncio.TimeoutError:
                    trace.append("api_timeout_30s")

                # If no API captured, check if we're bot-blocked
                if not api_payloads:
                    html = await page.content()
                    page_len = len(html)
                    if (is_bot_blocked_html(html) or "access denied" in html.lower()) and page_len < 2000:
                        blocked = True
                        message = "Akamai / bot protection blocked the request."
                        trace.append(f"akamai_blocked_len:{page_len}")
                    else:
                        # Page loaded but no API call captured yet
                        trace.append(f"page_loaded_no_api_len:{page_len}")
                        # Try falling back to text scraping
                        page_text = await page.evaluate("document.body ? document.body.innerText : ''")
                        events = self._extract_events_from_text(page_text)
                        trace.append(f"text_events:{len(events)}")
                        if not events:
                            message = "Tracking page loaded but no tracking data found."
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

                await browser.close()

        except Exception as exc:
            message = f"Delta tracking failed: {exc}"
            blocked = True
            trace.append(f"exception:{str(exc)[:80]}")

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
        """Parse the trackAwb GET response.
        
        Observed structure:
        {
          "messages": [{"code": "-213", ...}],    # -213 = not found
          "data": { ... tracking data ... },
          "webTokens": { ... }
        }
        """
        events: List[TrackingEvent] = []

        # Navigate into 'data' key
        data = payload.get("data", payload)
        if not data:
            return events

        items = []

        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            # Try common keys for event arrays
            for key in ("trackingInfo", "TrackingInfo", "events", "milestones", "legs",
                        "shipmentEvents", "awbEvents", "items", "result"):
                if key in data:
                    val = data[key]
                    items = val if isinstance(val, list) else [val]
                    break
            else:
                # Use the whole data dict as a single item
                items = [data]

        for item in items:
            if not isinstance(item, dict):
                continue
            status_code = (item.get("statusCode") or item.get("status") or
                           item.get("milestoneCode") or item.get("eventCode") or "UNKN")
            location = (item.get("location") or item.get("airport") or
                        item.get("stationCode") or item.get("city"))
            date = (item.get("date") or item.get("eventDate") or
                    item.get("dateTime") or item.get("eventDateTime") or "")
            flight = item.get("flightNumber") or item.get("flight") or item.get("flightNo")
            pieces = str(item.get("pieces") or item.get("quantity") or "")
            weight = str(item.get("weight") or "")
            remarks = (item.get("description") or item.get("remarks") or
                       item.get("milestone") or item.get("eventDescription") or "")

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

    def _extract_events_from_text(self, page_text: str) -> List[TrackingEvent]:
        """Fallback: parse text content of the tracking page."""
        events: List[TrackingEvent] = []
        lines = page_text.split("\n")
        for line in lines:
            m = re.search(r"(\d{2}/\d{2}/\d{4})\s+(\d{4})\s+(.*)", line)
            if m:
                date_str, time_str, activity = m.group(1), m.group(2), m.group(3).strip()
                location = None
                loc_m = re.search(r"\b(at|from|to|in|for)\s+([A-Z]{3})\b", activity, re.IGNORECASE)
                if loc_m:
                    location = loc_m.group(2).upper()
                status_code = "UNKN"
                act_low = activity.lower()
                if "accepted" in act_low or "received" in act_low:
                    status_code = "RCS"
                elif "departed" in act_low or "left" in act_low:
                    status_code = "DEP"
                elif "arrived" in act_low:
                    status_code = "ARR"
                elif "delivered" in act_low:
                    status_code = "DLV"
                events.append(TrackingEvent(
                    status_code=status_code,
                    location=location,
                    date=f"{date_str} {time_str}",
                    remarks=activity[:200],
                ))
        return events
