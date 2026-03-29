from __future__ import annotations

import re
from typing import List, Optional
from bs4 import BeautifulSoup
from curl_cffi.requests import AsyncSession

from .base import AirlineTracker
from .common import normalize_awb
from models import TrackingEvent, TrackingResponse

class DHLAviationTracker(AirlineTracker):
    name = "dhl"
    base_url = "https://aviationcargo.dhl.com/track/"

    async def track(self, awb: str, hawb: Optional[str] = None, **kwargs) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="615")
        awb_fmt = f"{prefix}-{serial}"
        
        target_url = f"{self.base_url}{awb_fmt}"
        message = "Success"
        blocked = False
        html = ""
        events: List[TrackingEvent] = []
        origin = None
        destination = None
        pieces = None
        weight = None
        trace = []

        try:
            trace.append(f"fetching:{target_url}")
            async with AsyncSession(impersonate="chrome110") as s:
                # Add typical headers to avoid blocking
                s.headers.update({
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.5",
                    "Sec-Fetch-Dest": "document",
                    "Sec-Fetch-Mode": "navigate",
                    "Sec-Fetch-Site": "none",
                })
                res = await s.get(target_url, timeout=30)
                html = res.text
                trace.append(f"status:{res.status_code}")
                
            if "Tracking DHL ACS Shipments" not in html and res.status_code != 200:
                blocked = True
                message = f"Failed to fetch tracking data (HTTP {res.status_code})"
                if res.status_code in [403, 429]:
                    message = "Bot protection blocked the request."
            else:
                soup = BeautifulSoup(html, "lxml")
                
                # Check if it has tracking results
                results_div = soup.find(id="tracking-results")
                if not results_div:
                    message = "No tracking results found for this AWB."
                else:
                    message = "Successfully loaded tracking data."
                    
                    # 1. Parse Pieces & Weight
                    # Example text: "for 1 pieces @ 136 KG"
                    body_text = soup.get_text(separator=" ")
                    pw_match = re.search(r'for\s+(\d+)\s+pieces?\s*@\s*([0-9.]+\s*(?:KG|LB|KGS|LBS))', body_text, re.IGNORECASE)
                    if pw_match:
                        pieces = pw_match.group(1)
                        weight = pw_match.group(2)
                    else:
                        # Fallback for old format
                        pw_match = re.search(r'(\d+)\s+pieces\s*@\s*([0-9.]+.*?)\s+as', body_text, re.IGNORECASE)
                        if pw_match:
                            pieces = pw_match.group(1)
                            weight = pw_match.group(2).strip()

                    # 2. Parse Origin & Destination
                    # Example: "From DHL Org TLV to DHL Dest SIN"
                    od_match = re.search(r'From(?: DHL| PPWK)? Org\s+([A-Z]{3})\s+to(?: DHL| PPWK)? Dest\s+([A-Z]{3})', body_text, re.IGNORECASE)
                    if od_match:
                        origin = od_match.group(1).upper()
                        destination = od_match.group(2).upper()

                    # 3. Parse events table
                    table = soup.find("table", class_="tracking-results")
                    if table:
                        current_date = ""
                        # Find all TRs
                        rows = table.find_all("tr")
                        
                        for r in rows:
                            th = r.find("th")
                            if th and th.get("colspan") == "2":
                                # Extract date, e.g., "Tuesday, February 24, 2026"
                                dt_text = th.get_text(strip=True)
                                if dt_text:
                                    current_date = dt_text
                                continue
                            
                            tds = r.find_all("td")
                            if len(tds) >= 6:
                                status_code = tds[0].get_text(strip=True)
                                
                                # Process remarks (remove the + Show Content buttons)
                                remarks_td = tds[1]
                                # remove hidden elements
                                for hidden in remarks_td.find_all(style=re.compile("display:\s*none")):
                                    hidden.decompose()
                                for btn in remarks_td.find_all("button"):
                                    btn.decompose()
                                remarks = remarks_td.get_text(separator=" ", strip=True)
                                
                                evt_pieces = tds[2].get_text(strip=True) # e.g. "1 pcs"
                                location = tds[3].get_text(strip=True)
                                evt_time = tds[5].get_text(strip=True)
                                
                                # Combine date + time
                                full_date = f"{current_date} {evt_time}".strip()
                                
                                # Look for flight in remarks (e.g. "Manifested onto movement 3S530 to SIN")
                                flight = None
                                f_match = re.search(r'movement ([\w\d]+)', remarks, re.IGNORECASE)
                                if f_match:
                                    flight = f_match.group(1)
                                
                                ev = TrackingEvent(
                                    status_code=status_code,
                                    location=location,
                                    date=full_date,
                                    remarks=remarks,
                                    pieces=evt_pieces,
                                    flight=flight
                                )
                                events.append(ev)
                                
        except Exception as exc:
            message = f"DHL Aviation tracking failed: {exc}"
            blocked = True

        # Sort chronologically (Oldest to Latest)
        # However, the table might be in newest-first order.
        # Let's just reverse it if the first event is older than the last.
        # Actually it's best to reverse it so it's oldest -> newest.
        if events:
            events.reverse()

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
                "source_url": target_url,
                "event_count": len(events),
                "trace": trace,
                "pieces": pieces,
                "weight": weight,
            },
        )
