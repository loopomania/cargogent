"""
Delta Cargo tracker — Playwright implementation with Headed Mode on Xvfb.

Aligned EXACTLY with the successful diagnostic script.
No manual stealth scripts (headed mode on Xvfb is already realistic).
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
from models import TrackingEvent, TrackingResponse


class DeltaTracker(AirlineTracker):
    name = "delta"
    base_url = "https://www.deltacargo.com/Cargo/trackShipment"

    async def track(self, awb: str) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="006")
        awb_fmt = f"{prefix}-{serial}"
        awb_clean = f"{prefix}{serial}"

        message = "Success"
        blocked = False
        events: List[TrackingEvent] = []
        trace: List[str] = []

        os.environ["DISPLAY"] = ":99"

        proxy_config = None
        if self.proxy:
            m = re.search(r'https?://(?:([^:@]+):([^@]*)@)?([^:]+):(\d+)', self.proxy)
            if m:
                user, password, host, port = m.groups()
                proxy_config = {
                    "server": f"http://{host}:{port}",
                    "username": user,
                    "password": password,
                }
                trace.append("using_playwright_proxy")

        source_url = f"{self.base_url}?awbNumber={awb_clean}"

        try:
            async with async_playwright() as p:
                # Launch in HEADED mode, minimal args to match diagnostic success
                browser = await p.chromium.launch(
                    headless=False,
                    proxy=proxy_config,
                    args=["--no-sandbox", "--disable-dev-shm-usage"],
                )

                # No manual stealth here - headed mode on Xvfb is already quite stealthy
                context = await browser.new_context(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                )

                page = await context.new_page()
                trace.append("browser_started_headed_no_stealth_scripts")

                api_payloads: list = []
                async def on_response(response: Response):
                    url = response.url.lower()
                    if response.status == 200 and "json" in response.headers.get("content-type", "") and ("track" in url or "shipment" in url):
                        try:
                            body = await response.body()
                            data = json.loads(body.decode("utf-8", errors="ignore"))
                            api_payloads.append(data)
                        except: pass
                page.on("response", on_response)

                trace.append(f"navigating:{source_url[-50:]}")
                await page.goto(source_url, timeout=60000, wait_until="domcontentloaded")

                # Wait for Angular + Akamai
                await asyncio.sleep(25)

                html = await page.content()
                page_text = await page.evaluate("document.body ? document.body.innerText : ''")

                if (is_bot_blocked_html(html) or "access denied" in html.lower()) and len(html) < 10000:
                    # Take failure screenshot
                    try: await page.screenshot(path="delta_fail.png")
                    except: pass
                    blocked = True
                    message = "Akamai / bot protection blocked the request."
                    trace.append(f"akamai_blocked_len:{len(html)}")
                else:
                    trace.append(f"page_loaded_len:{len(html)}")

                    for _ in range(5):
                        if api_payloads: break
                        await asyncio.sleep(2)

                    if api_payloads:
                        for payload in api_payloads:
                            events.extend(self._parse_api_payload(payload))
                        trace.append(f"parsed_api_events:{len(events)}")
                    
                    if not events:
                        trace.append("falling_back_to_text_scraping")
                        events = self._extract_events_from_text(page_text)
                        trace.append(f"text_events:{len(events)}")

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
            raw_meta={ "source_url": source_url, "event_count": len(events), "trace": trace },
        )

    def _parse_api_payload(self, payload) -> List[TrackingEvent]:
        events: List[TrackingEvent] = []
        items = []
        if isinstance(payload, list): items = payload
        elif isinstance(payload, dict):
            for key in ("trackingInfo", "TrackingInfo", "data", "result", "items", "events", "legs"):
                if key in payload:
                    val = payload[key]
                    items = val if isinstance(val, list) else [val]
                    break
            else: items = [payload]
        
        for item in items:
            if not isinstance(item, dict): continue
            status_code = item.get("statusCode") or item.get("status") or item.get("milestoneCode") or "UNKN"
            location = item.get("location") or item.get("airport") or item.get("stationCode")
            date = item.get("date") or item.get("eventDate") or item.get("dateTime") or ""
            flight = item.get("flightNumber") or item.get("flight")
            pieces = str(item.get("pieces") or item.get("quantity") or "")
            weight = str(item.get("weight") or "")
            remarks = item.get("description") or item.get("remarks") or item.get("milestone") or ""

            events.append(TrackingEvent(
                status_code=str(status_code)[:10],
                location=str(location)[:3].upper() if location else None,
                date=str(date), flight=str(flight) if flight else None,
                pieces=pieces, weight=weight, remarks=str(remarks)[:200],
            ))
        return events

    def _extract_events_from_text(self, page_text: str) -> List[TrackingEvent]:
        events: List[TrackingEvent] = []
        lines = page_text.split("\n")
        for line in lines:
            m = re.search(r"(\d{2}/\d{2}/\d{4})\s+(\d{4})\s+(.*)", line)
            if m:
                date_str, time_str, activity = m.group(1), m.group(2), m.group(3).strip()
                location = None
                loc_m = re.search(r"\b(at|from|to|in|for)\s+([A-Z]{3})\b", activity, re.IGNORECASE)
                if loc_m: location = loc_m.group(2).upper()
                status_code = "UNKN"
                act_low = activity.lower()
                if "accepted" in act_low or "received" in act_low: status_code = "RCS"
                elif "departed" in act_low or "left" in act_low: status_code = "DEP"
                elif "arrived" in act_low: status_code = "ARR"
                elif "delivered" in act_low: status_code = "DLV"
                events.append(TrackingEvent(
                    status_code=status_code, location=location, date=f"{date_str} {time_str}", description=activity[:200],
                ))
        return events
