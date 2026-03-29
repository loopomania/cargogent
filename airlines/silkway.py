from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import List

from curl_cffi import requests

from .base import AirlineTracker
from .common import normalize_awb
from models import TrackingEvent, TrackingResponse

class SilkWayTracker(AirlineTracker):
    name = "silkway"
    info_url = "https://sww.enxt.solutions/api/TrackAndTrace/"
    events_url = "https://sww.enxt.solutions/api/Messages/GetFSUData"

    async def track(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="501")
        awb_fmt = f"{prefix}-{serial}"
        message = "Success"
        blocked = False
        events: List[TrackingEvent] = []
        
        origin = None
        destination = None
        pieces = None
        weight = None
        remarks = None
        
        url_info = f"{self.info_url}{awb_fmt}"
        url_events = f"{self.events_url}?prefix={prefix}&serial={serial}"

        headers = {
            "Accept": "application/json, text/plain, */*",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            "Origin": "https://silkwaywest.com",
            "Referer": "https://silkwaywest.com/",
        }

        try:
            async with requests.AsyncSession() as session:
                # Fetch both master info and tracking events concurrently
                info_task = session.get(url_info, headers=headers)
                events_task = session.get(url_events, headers=headers)
                
                info_resp, events_resp = await asyncio.gather(info_task, events_task)
                
                if info_resp.status_code == 200:
                    try:
                        info_data = info_resp.json()
                        pieces = str(info_data.get("pieces", ""))
                        weight = str(info_data.get("actualWeight", ""))
                        # Origin/Destination might be populated via airports mapping or if we have routes
                        if "routes" in info_data and info_data["routes"]:
                            # Attempting to derive from the airport map
                            airport_map = {a["id"]: a["iataCode"] for a in info_data.get("airports", [])}
                            first_route = info_data["routes"][0]
                            last_route = info_data["routes"][-1]
                            origin = airport_map.get(first_route.get("origin"))
                            destination = airport_map.get(last_route.get("destination"))
                    except BaseException as e:
                        pass
                
                if events_resp.status_code == 200:
                    try:
                        events_data = events_resp.json()
                        if isinstance(events_data, list):
                            for evt in events_data:
                                status_code = evt.get("FSU_Code", "UNKN")
                                if status_code == "ERR": continue # Internal parse errors returned by their API sometimes
                                
                                location = evt.get("Origin_IATA") or evt.get("Destination_IATA")
                                date_str = evt.get("Time_Stamp") or evt.get("Flight_Date")
                                flight_num = evt.get("Flight_Number")
                                carrier_code = evt.get("Carrier_Code", "7L")
                                
                                flight = None
                                if flight_num:
                                    flight = f"{carrier_code}{flight_num}"
                                
                                evt_desc = evt.get("FSU_Description") or evt.get("Description")
                                
                                events.append(TrackingEvent(
                                    status_code=status_code,
                                    location=location,
                                    date=date_str,
                                    flight=flight,
                                    remarks=evt_desc
                                ))
                    except BaseException as e:
                        pass
                else:
                    message = f"Failed to fetch timeline: HTTP {events_resp.status_code}"
                    
        except Exception as exc:
            message = f"Silk Way fetching error: {exc}"
            blocked = True
        
        status, flight_guess = None, None
        if events:
            # Sort events chronologically (Oldest to Newest)
            def parse_date(evt):
                if not evt.date:
                    return datetime.min
                try:
                    # ISO style: '2026-02-04T09:16:21.518588'
                    return datetime.fromisoformat(evt.date)
                except:
                    return datetime.min

            events.sort(key=parse_date)
            status = events[-1].status_code
            flight_guess = next((e.flight for e in reversed(events) if e.flight), None)

        return TrackingResponse(
            airline=self.name,
            awb=awb_fmt,
            origin=origin,
            destination=destination,
            status=status,
            flight=flight_guess,
            events=events,
            message=message,
            blocked=blocked,
            raw_meta={
                "pieces": pieces,
                "weight": weight,
                "info_url": url_info,
                "events_url": url_events
            },
        )
