"""
United Cargo tracker.

Uses undetected-chromedriver to access https://www.unitedcargo.com/en/us/track/awb/{awb}.
The site is built with Next.js and embeds tracking data in a JSON script tag.
"""

from __future__ import annotations

import re
import time
import json
from datetime import datetime
from typing import List, Optional, Dict, Any

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from .base import AirlineTracker
from .common import (
    is_bot_blocked_html,
    normalize_awb,
)
from .proxy_util import get_rotating_proxy, get_proxy_extension
from models import TrackingEvent, TrackingResponse


class UnitedTracker(AirlineTracker):
    name = "united"
    base_url = "https://www.unitedcargo.com/en/us/track/awb/"

    def _extract_from_json(self, html: str) -> Dict[str, Any]:
        """Extract tracking data from the __NEXT_DATA__ script tag."""
        try:
            # Find the __NEXT_DATA__ script tag
            match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.DOTALL)
            if not match:
                return {}
            
            data = json.loads(match.group(1))
            
            # Navigate to the tracking details
            # Path: props -> pageProps -> api -> tracking -> [0]
            tracking_list = data.get("props", {}).get("pageProps", {}).get("api", {}).get("tracking", [])
            if not tracking_list:
                return {}
            
            return tracking_list[0]
        except Exception as e:
            print(f"JSON extraction failed: {e}")
            return {}

    def _parse_json_to_events(self, raw_data: Dict[str, Any]) -> List[TrackingEvent]:
        """Convert raw JSON data into TrackingEvent objects."""
        events: List[TrackingEvent] = []
        
        # United groups movements by station in sortedMovementList
        milestone_groups = raw_data.get("sortedMovementList", [])
        for group in milestone_groups:
            # Note: Station group might have a station name but movements within it have their own station code
            movements = group.get("movements", [])
            
            for m in movements:
                station = m.get("station", "").upper()
                description = m.get("sts_description", "")
                
                # timestamps
                timestamp = m.get("sts_date_time_local", "")
                zulu_timestamp = m.get("sts_date_time_zulu", "")
                
                status_code = m.get("sts_code", "UNKN")
                flight_num = m.get("flightNumber")
                airline_code = m.get("airlineCode", "UA")
                flight = f"{airline_code}{flight_num}" if flight_num else None
                
                pieces = m.get("pieces")
                weight = m.get("weight")
                weight_unit = m.get("weight_unit")
                weight_str = f"{weight} {weight_unit}" if weight and weight_unit else str(weight) if weight else None

                ev = TrackingEvent(
                    status_code=status_code,
                    location=station,
                    date=timestamp,
                    remarks=description,
                    pieces=str(pieces) if pieces else None,
                    weight=weight_str,
                    flight=flight
                )
                # Attach zulu time for sorting
                setattr(ev, "_zulu_time", zulu_timestamp)
                events.append(ev)

        # Sort chronologically (Oldest to Latest)
        def get_zulu(ev):
            z = getattr(ev, "_zulu_time", "")
            if not z:
                return datetime.min
            try:
                # Format: 2026-01-04 16:05:00
                return datetime.strptime(z, "%Y-%m-%d %H:%M:%S")
            except:
                return datetime.min

        events.sort(key=get_zulu)
        return events

    async def track(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="016")
        awb_fmt = f"{prefix}-{serial}"
        message = "Success"
        blocked = False
        html = ""
        source_url = f"{self.base_url}{awb_fmt}"
        trace = []

        options = uc.ChromeOptions()
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1920,1080")

        if self.proxy:
            rotated_proxy = get_rotating_proxy(self.proxy)
            ext_path = get_proxy_extension(rotated_proxy, f"/tmp/proxy_ext_{self.name}")
            if ext_path:
                options.add_argument(f"--load-extension={ext_path}")
            else:
                options.add_argument(f'--proxy-server={rotated_proxy}')

        driver = None
        try:
            driver = uc.Chrome(options=options, headless=False, use_subprocess=True, version_main=146)
            driver.set_page_load_timeout(90)

            trace.append(f"navigating_to:{source_url}")
            driver.get(source_url)
            
            # Wait for any component that indicates load. Next.js usually renders skeleton or main container
            try:
                # This selector was seen in the header area in previous logs
                WebDriverWait(driver, 20).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "h1"))
                )
                trace.append("page_rendered")
            except:
                trace.append("render_wait_timeout")

            # Wait a few seconds for hydration/data to stay for sure
            time.sleep(5)
            html = driver.page_source

            if is_bot_blocked_html(html):
                blocked = True
                message = "Bot protection blocked the request."
            else:
                message = "Successfully loaded tracking data."

        except Exception as exc:
            message = f"United tracking failed: {exc}"
            blocked = True
        finally:
            if driver:
                try:
                    driver.quit()
                except Exception:
                    pass

        # Process data
        raw_json = self._extract_from_json(html)
        if not raw_json and not blocked:
            message = "No tracking data found in JSON."
            events = []
            origin = None
            destination = None
            pieces = None
            weight = None
            remarks = None
        else:
            # Shipment details from master_consignment_dtl
            mcd = raw_json.get("master_consignment_dtl", {})
            
            pieces = str(mcd.get("pieces", ""))
            weight_val = mcd.get("total_booked_weight")
            weight_unit = mcd.get("weight_unit")
            weight = f"{weight_val} {weight_unit}" if weight_val and weight_unit else str(weight_val) if weight_val else None
            
            # Nature of goods
            remarks = mcd.get("nature_of_goods")
            
            origin = mcd.get("origin", {}).get("station_code")
            destination = mcd.get("destination", {}).get("station_code")
            
            events = self._parse_json_to_events(raw_json)

        status = events[-1].status_code if events else None
        flight = next((e.flight for e in reversed(events) if e.flight), None)

        return TrackingResponse(
            airline=self.name,
            awb=awb_fmt,
            origin=origin,
            destination=destination,
            status=status,
            flight=flight,
            events=events,
            message=message,
            blocked=blocked,
            raw_meta={
                "source_url": source_url,
                "event_count": len(events),
                "trace": trace,
                "pieces": pieces,
                "weight": weight,
                "remarks": remarks
            },
        )
