from __future__ import annotations

import re
from datetime import datetime
import requests
from bs4 import BeautifulSoup

from .base import AirlineTracker
from .common import (
    normalize_awb,
)
from models import TrackingResponse, TrackingEvent


class AirEuropaTracker(AirlineTracker):
    name = "aireuropa"
    base_url = "https://www.uxtracking.com/tracking.asp"

    async def track(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="996")
        awb_fmt = f"{prefix}-{serial}"
        message = "Success"
        blocked = False
        events = []
        origin = None
        destination = None
        
        source_url = self.base_url

        headers = {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        }
        
        data = {
            "prefix": prefix,
            "Serial": serial
        }

        try:
            def fetch_data():
                return requests.post(self.base_url, headers=headers, data=data, timeout=15, verify=False)
            
            request = await self.run_sync(fetch_data)
            
            if request.status_code != 200:
                message = f"Failed to fetch data: HTTP {request.status_code}"
                blocked = True
            else:
                resp_text = request.text
                soup = BeautifulSoup(resp_text, "lxml")
                
                # Check for "invalid" or "not found" texts maybe
                if "No records found" in resp_text or "Invalid" in resp_text:
                    pass # Keep events empty
                
                
                # Setup a set to announce BKD flights exactly once per explicit leg
                seen_legs = set()
                leg_origins = set()
                leg_destinations = set()
                all_legs = [] # list of (origin, dest)
                
                # The HTML has a table. We will find all tr elements.
                # Data rows usually contain 8 columns
                rows = soup.find_all("tr")
                for row in rows:
                    cols = row.find_all("td")
                    if len(cols) == 8:
                        # Validate if this is a data row and not a header
                        col_texts = [c.get_text(strip=True) for c in cols]
                        
                        # Example:
                        # 0: Origin (MAD)
                        # 1: Destination (EZE)
                        # 2: Flight (UX041)
                        # 3: Flight Date (02/04/2026)
                        # 4: Pcs/Wt (11/196)
                        # 5: Status (Departed MAD)
                        # 6: Event Date (02/04/2026)
                        # 7: Event Time (23:55)
                        
                        row_origin = col_texts[0]
                        row_dest = col_texts[1]
                        flight = col_texts[2]
                        # col 3 is flight date
                        pieces_weight = col_texts[4]
                        remarks = col_texts[5]
                        evt_date = col_texts[6]
                        evt_time = col_texts[7]
                        
                        # basic check if it's a valid row (Origin should be length 3)
                        if len(row_origin) == 3 and len(row_dest) == 3:
                            leg_origins.add(row_origin)
                            leg_destinations.add(row_dest)
                            all_legs.append((row_origin, row_dest))
                            
                            flight_date = col_texts[3]
                            leg_key = f"{row_origin}-{row_dest}-{flight}"
                            if leg_key not in seen_legs and flight_date:
                                seen_legs.add(leg_key)
                                try:
                                    f_dt = datetime.strptime(flight_date.strip(), "%d/%m/%Y")
                                    estimated_base_date = f_dt.strftime("%Y-%m-%dT00:00:00")
                                    events.append(TrackingEvent(
                                        status_code="BKD",
                                        location=row_origin,
                                        date=estimated_base_date,
                                        flight=flight,
                                        remarks="Scheduled Leg",
                                    ))
                                    events.append(TrackingEvent(
                                        status_code="ARR",
                                        location=row_dest,
                                        date=None,
                                        estimated_date=estimated_base_date,
                                        flight=flight,
                                        remarks="Estimated Arrival",
                                    ))
                                except:
                                    pass
                            
                            pcs, wt = "", ""
                            if "/" in pieces_weight:
                                pcs, wt = pieces_weight.split("/", 1)
                            
                            full_date_str = ""
                            if evt_date and evt_time:
                                try:
                                    dt = datetime.strptime(f"{evt_date} {evt_time}", "%d/%m/%Y %H:%M")
                                    full_date_str = dt.strftime("%Y-%m-%dT%H:%M:00")
                                except:
                                    full_date_str = f"{evt_date} {evt_time}"
                                
                            status_code = ""
                            r_upper = remarks.upper()
                            evt_location = row_origin  # default to origin

                            if "RECEIVED" in r_upper:
                                if f" {row_dest} " in r_upper or r_upper.endswith(row_dest) or row_dest in r_upper:
                                    status_code = "ARR"
                                    evt_location = row_dest
                                else:
                                    status_code = "RCS"
                            elif "DEPARTED" in r_upper:
                                status_code = "DEP"
                                if f" {row_dest} " in r_upper or r_upper.endswith(row_dest):
                                    evt_location = row_dest
                            elif "ARRIVED" in r_upper:
                                status_code = "ARR"
                                evt_location = row_dest
                            elif "PRE-MANIFESTED" in r_upper or "PRE-MANIFEST" in r_upper:
                                status_code = "BKG"
                            elif "MANIFESTED" in r_upper:
                                status_code = "MAN"
                            elif "DELIVERED" in r_upper:
                                status_code = "DLV"
                                evt_location = row_dest
                            else:
                                status_code = "UNK"
                                
                            events.append(
                                TrackingEvent(
                                    status_code=status_code,
                                    status=remarks,
                                    location=evt_location,
                                    date=full_date_str,
                                    flight=flight,
                                    pieces=pcs.strip(),
                                    weight=wt.strip(),
                                    remarks=remarks,
                                )
                            )
                
        except Exception as exc:
            message = f"aireuropa fetching error: {exc}"
            blocked = True

        if events:
            # Sort events chronologically. 
            def parse_date_val(evt):
                d_str = evt.date or evt.estimated_date
                if not d_str:
                    return datetime.min
                try:
                    if "T" in d_str:
                        return datetime.strptime(d_str.strip(), "%Y-%m-%dT%H:%M:%S")
                    else:
                        # try different formats if needed
                        return datetime.strptime(d_str.strip()[:16], "%Y-%m-%d %H:%M")
                except:
                    return datetime.min

            events.sort(key=parse_date_val)
            
            # Deduplicate estimated events if an actual event exists for same location/status
            # Specifically for ARR and BKD/DEP
            final_events = []
            actualified_locs = set() # (status_code, location) -> has actual date
            for e in events:
                if e.date:
                    actualified_locs.add((e.status_code, e.location))
            
            for e in events:
                if not e.date and e.estimated_date:
                    # check if we have an actual one
                    if (e.status_code, e.location) in actualified_locs:
                        continue
                final_events.append(e)
            events = final_events

            status = events[-1].status_code if events else None
            flight_guess = next((e.flight for e in reversed(events) if e.flight and len(e.flight) > 2), None)
            
            # Global Origin/Destination detection
            # Origin is a leg origin that is not a leg destination
            if leg_origins:
                pot_origins = leg_origins - leg_destinations
                if pot_origins:
                    origin = list(pot_origins)[0] # Usually just one
                else:
                    # Circular or single leg that was missed? Fallback to first row
                    if all_legs: origin = all_legs[-1][0] # Rows are usually reversed

                pot_dests = leg_destinations - leg_origins
                if pot_dests:
                    destination = list(pot_dests)[0]
                else:
                    if all_legs: destination = all_legs[0][1] # Rows are usually reversed (dest is top row)

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
