from __future__ import annotations

import json
import re
from datetime import datetime
import requests

from .base import AirlineTracker
from .proxy_util import get_rotating_proxy
from .common import (
    normalize_awb,
    summarize_from_events,
)
from models import TrackingResponse, TrackingEvent


class CargoPalTracker(AirlineTracker):
    name = "cargopal"
    base_url = "https://cargo.pal.com.ph/Services/Shipment/AWBTrackingService.svc/GetAWBTrackingRecord"

    async def track(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="079")
        awb_fmt = f"{prefix}-{serial}"
        message = "Success"
        blocked = False
        events = []
        origin = None
        destination = None
        
        # Always search by AWB serial (BasedOn=0).
        # Passing HAWB to PAL's API (BasedOn=1) returns HTTP 500 for ISR-prefixed HAWBs.
        source_url = f"{self.base_url}?AWBNo={serial}&BasedOn=0&AccountSNo=0&flag=0&CarrierCode={prefix}&AWBTrackingCaptchaCode="

        headers = {
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://cargo.pal.com.ph/Tracking/AWB",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "X-Requested-With": "XMLHttpRequest",
        }

        try:
            rotated_proxy = get_rotating_proxy(self.proxy) if self.proxy else None
            proxies = {"http": rotated_proxy, "https": rotated_proxy} if rotated_proxy else None
            
            def fetch_data():
                return requests.get(source_url, headers=headers, proxies=proxies, verify=False, timeout=15)
            
            request = await self.run_sync(fetch_data)
            
            if request.status_code != 200:
                message = f"Failed to fetch data: HTTP {request.status_code}"
                blocked = True
            else:
                resp_text = request.text
                        
                # The API returns a JSON string, which is actually a JSON-encoded string containing JSON.
                try:
                    data = json.loads(resp_text)
                    if isinstance(data, str):
                        data = json.loads(data)
                except json.JSONDecodeError as e:
                    message = f"Failed to parse JSON response: {e}"
                    data = None

                if data:
                    # Table0 usually contains the summary information
                    if "Table0" in data and len(data["Table0"]) > 0:
                        summary = data["Table0"][0]
                        origin = summary.get("Origin")
                        destination = summary.get("Destination")
                    
                    # Table3 usually contains the detailed milestone plan / flight details
                    if "Table3" in data:
                        for item in data["Table3"]:
                            status_code = item.get("Action", "").upper()
                            # Use Station for the exact event location, fallback to Origin
                            location = item.get("Station") or item.get("Origin")
                            
                            # Use FlightDate first (full year, e.g. '28 Feb 2026')
                            # ActualDepTime is same date but 2-digit year ('28 Feb 26') - less reliable for parsing
                            date_str = item.get("FlightDate") or item.get("ActualDepTime") or item.get("ActualArrivalTime")
                            # Fallback to createdon if no flight date
                            if not date_str:
                                date_str = item.get("createdon")
                                
                            flight = item.get("FlightNo")
                            pieces = str(item.get("ActualPieces") or item.get("Pieces") or "")
                            weight = str(item.get("Weight") or "")
                            
                            # Construct a nice remark based on action
                            remarks = ""
                            if status_code == "BKD":
                                remarks = "Booking confirmed"
                            elif status_code == "EXE":
                                remarks = "Booking executed"
                            elif status_code == "RCS":
                                remarks = "Shipment accepted"
                            elif status_code == "DEP":
                                remarks = "Departed"
                            elif status_code == "ARR":
                                remarks = "AWB Arrived"
                            elif status_code == "RCF":
                                remarks = "Received from flight"
                            elif status_code == "NFD":
                                remarks = "Ready for pick-up"
                            elif status_code == "DLV":
                                remarks = "Delivered"

                            events.append(
                                TrackingEvent(
                                    status_code=status_code,
                                    status=remarks,
                                    location=location,
                                    date=date_str,
                                    flight=flight,
                                    pieces=pieces,
                                    weight=weight,
                                    remarks=remarks,
                                )
                            )
                            
                    # If events were not populated by Table3, let's try Table1 which has "Latest Event" data
                    if not events and "Table1" in data:
                        for item in data["Table1"]:
                            status_code = item.get("Action", "").upper()
                            location = item.get("Station")
                            date_str = item.get("createdon")
                            events.append(
                                TrackingEvent(
                                    status_code=status_code,
                                    location=location,
                                    date=date_str,
                                )
                            )

        except Exception as exc:
            message = f"cargopal fetching error: {exc}"
            blocked = True

        status, flight_guess = None, None
        if events:
            # Sort events chronologically. 
            def parse_date(evt):
                if not evt.date:
                    return datetime.min
                
                # Clean up date string
                d = evt.date.strip()
                
                # Formats to try
                formats = [
                    "%d %b %y",           # 28 Feb 26
                    "%d %b %Y",           # 28 Feb 2026
                    "%H:%M %d %b %y",     # 13:20 02 Mar 26
                    "%d-%b-%Y %H:%M:%S",  # 16-Mar-2026 15:15:00
                    "%d %b %Y %H:%M",     # 16 Mar 2026 15:15
                    "%d-%b-%Y %H:%M",     # 26-Feb-2026 16:05
                ]
                
                # Try ISO format first
                try:
                    return datetime.fromisoformat(d.replace("Z", "+00:00"))
                except:
                    pass

                for fmt in formats:
                    try:
                        return datetime.strptime(d, fmt)
                    except:
                        continue
                
                # Last resort: try to find a date-like pattern
                match = re.search(r"(\d{1,2}\s+[A-Za-z]{3}\s+\d{2,4})", d)
                if match:
                    try:
                        date_part = match.group(1)
                        if len(date_part.split()[-1]) == 2:
                            return datetime.strptime(date_part, "%d %b %y")
                        return datetime.strptime(date_part, "%d %b %Y")
                    except:
                        pass
                
                return datetime.min

            events.sort(key=parse_date)
            
            # Deduplicate BKD and EXE only if they are for the same location
            # (Sometimes there are multiple identical records for the same leg)
            seen = set()
            dedup_events = []
            for e in events:
                # Use (status_code, location) as the unique key to preserve different legs
                key = (e.status_code, e.location)
                if e.status_code in ["BKD", "EXE"]:
                    if key not in seen:
                        seen.add(key)
                        dedup_events.append(e)
                else:
                    dedup_events.append(e)
            
            events = dedup_events

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
            raw_meta={"source_url": source_url},
        )

