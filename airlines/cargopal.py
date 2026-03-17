from __future__ import annotations

import json
import re
from datetime import datetime
from curl_cffi import requests

from .base import AirlineTracker
from .common import (
    normalize_awb,
    summarize_from_events,
)
from models import TrackingResponse, TrackingEvent


class CargoPalTracker(AirlineTracker):
    name = "cargopal"
    base_url = "https://cargo.pal.com.ph/Services/Shipment/AWBTrackingService.svc/GetAWBTrackingRecord"

    async def track(self, awb: str) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="079")
        awb_fmt = f"{prefix}-{serial}"
        message = "Success"
        blocked = False
        events = []
        origin = None
        destination = None
        source_url = f"{self.base_url}?AWBNo={serial}&BasedOn=0&AccountSNo=0&flag=0&CarrierCode={prefix}&AWBTrackingCaptchaCode="

        headers = {
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://cargo.pal.com.ph/Tracking/AWB",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "X-Requested-With": "XMLHttpRequest",
        }

        try:
            async with requests.AsyncSession(proxy=self.proxy) as session:
                request = await session.get(source_url, headers=headers, verify=False)
                if request.status_code != 200:
                    message = f"Failed to fetch data: HTTP {request.status_code}"
                    blocked = True
                else:
                    resp_text = request.text
                        
                    # The API returns a JSON string, which is actually a JSON-encoded string containing JSON.
                    # Sometimes it might just be the raw JSON object. We handle both.
                    try:
                        # Try parsing as JSON first
                        data = json.loads(resp_text)
                        if isinstance(data, str):
                            # If it's a string, it means it's double-encoded JSON
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
                                location = item.get("Station")
                                # Use createdon or ActualArrivalTime/ActualDepTime as the primary date
                                date_str = item.get("createdon")
                                # Fallback
                                if not date_str:
                                    date_str = item.get("ActualArrivalTime") or item.get("ActualDepTime")
                                    
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
            # CargoPal dates are often in ISO-like format from the API (createdon) 
            # or custom strings. We'll try to parse them for sorting.
            def parse_date(evt):
                if not evt.date:
                    return datetime.min
                # API dates from Table3/Table1 are usually "2026-03-16T..." 
                # or "16-Mar-2026 15:15:00" etc.
                try:
                    # Try ISO format first
                    return datetime.fromisoformat(evt.date.replace("Z", "+00:00"))
                except:
                    try:
                        # Try common PAL format "16-Mar-2026 15:15:00"
                        return datetime.strptime(evt.date, "%d-%b-%Y %H:%M:%S")
                    except:
                        try:
                            # Try "16 Mar 2026 15:15"
                            return datetime.strptime(evt.date, "%d %b %Y %H:%M")
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
            raw_meta={"source_url": source_url},
        )
