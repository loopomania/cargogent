from __future__ import annotations

import json
import urllib.request
import urllib.error
from typing import List

from .base import AirlineTracker
from .common import normalize_awb, summarize_from_events
from models import TrackingEvent, TrackingResponse


class MyFreighterTracker(AirlineTracker):
    name = "myfreighter"

    async def track(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        return await self.run_sync(self._track_sync, awb, hawb=hawb, **kwargs)

    def _track_sync(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="488")
        awb_fmt = f"{prefix}-{serial}"
        
        events: List[TrackingEvent] = []
        message = "Success"
        blocked = False
        
        url = f"https://myfreighter.uz/api/tracking?track_id={serial}"
        
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
                "Accept": "application/json",
                "Referer": "https://myfreighter.uz/en",
            }
        )
        
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                if response.status != 200:
                    blocked = True
                    message = f"MyFreighter returned HTTP {response.status}"
                else:
                    data = json.loads(response.read().decode("utf-8"))
                    
                    if not data.get("success"):
                        # E.g. {"error": "Tracking data not found"}
                        err = data.get("error", "Not found")
                        message = f"MyFreighter API: {err}"
                    else:
                        resp_data = data.get("data", {})
                        raw_events = resp_data.get("events", [])
                        
                        for ev in raw_events:
                            status_code = ev.get("status_code", "").strip()
                            description = ev.get("description", "").strip()
                            
                            # E.g. "2026-04-24T11:50:00.000Z" -> "2026-04-24 11:50"
                            time_utc = ev.get("time_utc", "")
                            date_str = None
                            if time_utc:
                                date_str = time_utc.replace("T", " ")[:16]
                                
                            loc_data = ev.get("location", {})
                            loc = loc_data.get("iata") if isinstance(loc_data, dict) else None
                            
                            seg_data = ev.get("segment", {})
                            flight = None
                            if isinstance(seg_data, dict) and seg_data.get("carrier") and seg_data.get("number"):
                                flight = f"{seg_data.get('carrier')}{seg_data.get('number')}"
                            
                            pieces = str(ev.get("pieces")) if ev.get("pieces") is not None else None
                            weight = str(ev.get("weight")) if ev.get("weight") is not None else None
                            
                            events.append(TrackingEvent(
                                status_code=status_code or "UNKN",
                                status=description or status_code,
                                location=loc,
                                date=date_str,
                                flight=flight,
                                pieces=pieces,
                                weight=weight,
                                remarks=f"{description} (MyFreighter)" if description else None,
                            ))
                            
                        # If no events but success, maybe awb is registered but no progress
                        if not events and resp_data.get("awb_number"):
                            message = "AWB registered, but no tracking events found."

        except urllib.error.HTTPError as e:
            blocked = True
            message = f"MyFreighter HTTPError: {e.code}"
        except urllib.error.URLError as e:
            blocked = True
            message = f"MyFreighter URLError: {e.reason}"
        except json.JSONDecodeError:
            blocked = True
            message = "MyFreighter API returned invalid JSON."
        except Exception as e:
            blocked = True
            message = f"MyFreighter error: {e}"

        summary_origin, summary_dest, status, flight = summarize_from_events(events)

        return TrackingResponse(
            airline=self.name,
            awb=awb_fmt,
            status=status,
            events=events,
            message=message,
            blocked=blocked,
        )
