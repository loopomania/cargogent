"""
United Cargo tracker.

Uses direct HTTP requests to https://www.unitedcargo.com/en/us/track/awb/{awb}.
The site is built with Next.js and embeds tracking data in a JSON __NEXT_DATA__ script tag,
which is available in the initial HTML response without JavaScript execution.
"""

from __future__ import annotations

import re
import json
from datetime import datetime
from typing import List, Optional, Dict, Any

from curl_cffi import requests as cffi_requests

from .base import AirlineTracker
from .common import normalize_awb
from models import TrackingEvent, TrackingResponse


class UnitedTracker(AirlineTracker):
    name = "united"
    base_url = "https://www.unitedcargo.com/en/us/track/awb/"

    def _extract_from_json(self, html: str) -> Dict[str, Any]:
        """Extract tracking data from the __NEXT_DATA__ script tag."""
        try:
            match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.DOTALL)
            if not match:
                return {}
            
            data = json.loads(match.group(1))
            
            # Navigate to: props -> pageProps -> api -> tracking -> [0]
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
                    status=description,
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
                return datetime.strptime(z, "%Y-%m-%d %H:%M:%S")
            except:
                return datetime.min

        events.sort(key=get_zulu)
        return events

    async def track(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        """Fetch tracking data via direct HTTP — no browser needed.
        
        United's Next.js site embeds all tracking data in the __NEXT_DATA__ 
        JSON blob in the initial server-rendered HTML, so no JS execution needed.
        """
        return await self.run_sync(self._track_sync, awb, hawb=hawb, **kwargs)

    def _track_sync(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="016")
        awb_fmt = f"{prefix}-{serial}"
        message = "Success"
        blocked = False
        html = ""
        source_url = f"{self.base_url}{awb_fmt}"
        trace = []

        try:
            trace.append(f"http_get:{source_url}")
            resp = cffi_requests.get(
                source_url,
                impersonate="chrome131",
                timeout=30,
                allow_redirects=True,
            )
            html = resp.text
            trace.append(f"status:{resp.status_code},len:{len(html)}")

            if resp.status_code == 403 or "Access Denied" in html:
                blocked = True
                message = "Bot protection blocked the request."
            elif resp.status_code != 200:
                blocked = True
                message = f"HTTP {resp.status_code}"
            else:
                message = "Successfully loaded tracking data."

        except Exception as exc:
            message = f"United tracking failed: {str(exc)[:80]}"
            blocked = True
            trace.append(f"error:{str(exc)[:40]}")

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
