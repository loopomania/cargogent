from __future__ import annotations
import logging
import asyncio
from typing import List
from playwright.async_api import async_playwright

from .base import AirlineTracker
from .common import normalize_awb
from models import TrackingResponse, TrackingEvent

logger = logging.getLogger(__name__)

AKAMAI_STEALTH_SCRIPT = """
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return 'Google Inc. (Apple)';
        if (parameter === 37446) return 'ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)';
        return getParameter.apply(this, [parameter]);
    };
"""

class EVATracker(AirlineTracker):
    name = "eva"

    async def track(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="695")
        awb_formatted = f"{prefix}-{serial}"
        
        try:
            async with async_playwright() as p:
                if not self.proxy:
                    raise Exception("Proxy required for EVA Air")
                    
                browser = await p.chromium.connect_over_cdp(self.proxy)
                context = browser.contexts[0]
                page = await context.new_page()

                await page.add_init_script(AKAMAI_STEALTH_SCRIPT)

                url = "https://www.brcargo.com/NEC_WEB/Tracking/QuickTracking/Index"
                logger.info(f"[EVA] Navigating to {url}")
                await page.goto(url, wait_until="domcontentloaded", timeout=60000)
                await asyncio.sleep(2)
                
                # Fill fields
                await page.fill("#QUTR00Prefix", prefix)
                await page.fill("#QUTR00AWBNo", serial)
                
                json_data = None
                try:
                    async with page.expect_response(lambda r: "QuickTrackingGet" in r.url and r.request.method == "POST", timeout=30000) as response_info:
                        await page.click("#QUTR00btnSearch")
                        
                    response = await response_info.value
                    if response.status == 200:
                        json_data = await response.json()
                except Exception as e:
                    logger.warning(f"[EVA] Could not extract API JSON or click track button: {e}")
                
                await browser.close()
                
                if not json_data:
                     return TrackingResponse(
                        awb=awb_formatted,
                        airline="EVA Air",
                        status="Error",
                        events=[],
                        message="Bypass failed or AWB not found (No JSON returned)",
                        raw_meta={"bypass_attempted": True},
                    )

                return self._parse_json(json_data, awb_formatted)
                
        except Exception as e:
            logger.error(f"[EVA] Error tracking {awb_formatted}: {e}")
            return TrackingResponse(
                awb=awb_formatted,
                airline="EVA Air",
                status="Error",
                events=[],
                message=f"Tracker failed: {str(e)}",
                raw_meta={"error": str(e)},
            )

    def _parse_json(self, data: dict, awb: str) -> TrackingResponse:
        events: List[TrackingEvent] = []
        
        # Determine status
        overall_status = data.get("CurrentStatus") or "No Status"
        
        # Parse Status Table (ground events)
        status_data = data.get("StatusTable", [])
        for s in status_data:
            st = s.get("Status") or "UNKN"
            pcs = s.get("Piece")
            wt = s.get("Weight")
            dt = s.get("DateTime")
            loc = s.get("Station")
            flt = s.get("FlightNo")
            
            # The Status field usually starts with the 3-letter IATA code, e.g. "RCF", "RCS", "BKD"
            status_code = "UNKN"
            if st and len(st.strip()) >= 3:
                status_code = st.strip()[:3]
                
            events.append(TrackingEvent(
                status_code=status_code,
                status=st,
                location=loc,
                date=dt,
                flight=flt,
                pieces=str(pcs) if pcs else None,
                weight=str(wt) if wt else None,
                remarks=f"Ground status: {st}"
            ))

        # Parse Flight Table (flight legs)
        flight_data = data.get("FlightTable", [])
        for f in flight_data:
            flt = f.get("FlightNo")
            dep_date = f.get("DepartureDate")
            dep_time = f.get("DepartureTime") # could be "Actual 10:00" or "Estimated 10:00"
            dep_loc = f.get("Departure")
            arr_loc = f.get("Arrival")
            pcs = f.get("Pieces")
            wt = f.get("Weight")
            
            clean_date = None
            if dep_date and dep_time:
                clean_time = dep_time.replace("Actual", "").replace("Estimated", "").strip()
                clean_date = f"{dep_date} {clean_time}".strip()
                
            code = "DEP" if "Actual" in (dep_time or "") else "BKD"
            
            events.append(TrackingEvent(
                status_code=code,
                status=f"Flight {code}",
                location=dep_loc,
                date=clean_date,
                flight=flt,
                pieces=str(pcs) if pcs else None,
                weight=str(wt) if wt else None,
                remarks=f"To {arr_loc}"
            ))
            
        origin = data.get("From")
        destination = data.get("To")

        return TrackingResponse(
            awb=awb,
            airline="EVA Air",
            status=overall_status,
            origin=origin,
            destination=destination,
            events=events,
            raw_meta={"source": "api_scraper", "status_events": len(status_data), "flight_events": len(flight_data)}
        )
