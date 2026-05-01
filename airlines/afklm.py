"""
Air France-KLM (AF-KLM) Cargo tracker.

Uses undetected-chromedriver to access https://www.afklcargo.com/mycargo/shipment/detail/{awb}.
The site is built with Angular and milestones are rendered dynamically.
"""

from __future__ import annotations

import re
import time
from typing import List, Optional
from datetime import datetime

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup

from .base import AirlineTracker
from .common import (
    is_bot_blocked_html,
    normalize_awb,
    get_uc_chrome_path,
)
from .proxy_util import get_rotating_proxy, get_proxy_extension
from models import TrackingEvent, TrackingResponse


class AFKLMTracker(AirlineTracker):
    name = "afklm"
    base_url = "https://www.afklcargo.com/mycargo/shipment/detail/"

    def _parse_html(self, html: str) -> dict:
        soup = BeautifulSoup(html, "html.parser")
        events: List[TrackingEvent] = []
        pieces = None
        weight = None
        remarks = None
        
        # 1. Parse Shipment Info (pieces, weight, remarks)
        shipment_info = soup.find("afkl-shipment-info")
        if shipment_info:
            lis = shipment_info.find_all("li")
            for li in lis:
                text = li.get_text(strip=True)
                # Look for weight and pieces
                if re.search(r'\b(?:pcs|pieces)\b', text, re.I) and re.search(r'\b(?:kg|lbs)\b', text, re.I):
                    pcs_match = re.search(r'(\d+)\s*(?:pcs|pieces)', text, re.I)
                    wt_match = re.search(r'([\d,\.]+)\s*(?:kg|lbs)', text, re.I)
                    if pcs_match: 
                        pieces = pcs_match.group(1)
                    if wt_match: 
                        weight = wt_match.group(0)
                # Look for description remarks
                elif "Manifest" in text or "Consolidation" in text or "Lithium" in text or len(text) > 30:
                    # Very primitive heuristic since remarks are usually the longest text
                    if not remarks:
                        remarks = text
        
        # 2. Extract Event history (station view)
        station_views = soup.find_all("div", class_=lambda c: c and "station-view" in c)
        for sv in station_views:
            rows = sv.find_all("div", class_=lambda c: c and "py-3" in c)
            for row in rows:
                station_tag = row.find(class_="stationName")
                if not station_tag: 
                    continue
                loc = station_tag.get_text(strip=True).upper()
                
                ul = row.find("ul", class_="description")
                if not ul: 
                    continue
                
                lis = ul.find_all("li")
                for li in lis:
                    spans = li.find_all("span")
                    texts = [s.get_text(strip=True) for s in spans if s.get_text(strip=True)]
                    if len(texts) >= 3:
                        status_raw = texts[0]
                        pcs_text = texts[1]
                        
                        # Date and flight extraction handling "Estimated:" splits
                        date_text = ""
                        flight = None
                        ev_pcs = None
                        
                        m_pcs = re.search(r'(\d+)', pcs_text)
                        if m_pcs:
                            ev_pcs = str(m_pcs.group(1))

                        # Find the actual date string (DD MMM HH:MM)
                        date_str_match = next((t for t in texts[2:] if re.match(r'\d{2}\s+[A-Z]{3}\s+\d{2}:\d{2}', t)), None)
                        if date_str_match:
                            date_text = date_str_match

                        # Find the flight string (e.g. "(AF0693)")
                        flight_match = next((t for t in texts[2:] if "(" in t and ")" in t), None)
                        if flight_match:
                            flight = flight_match.strip("()")
                        
                        # Map Status Code
                        status_code = "UNKN"
                        desc_low = status_raw.lower()
                        if "deliver" in desc_low or "dlv" in desc_low:
                            status_code = "DLV"
                        elif "depart" in desc_low or "dep" in desc_low:
                            status_code = "DEP"
                        elif "arrive" in desc_low or "arr" in desc_low:
                            status_code = "ARR"
                        elif "accept" in desc_low or "rcs" in desc_low or "receiv" in desc_low:
                            status_code = "RCS"
                        elif "book" in desc_low or "bkd" in desc_low or "confirm" in desc_low:
                            status_code = "BKD"
                        elif "notif" in desc_low or "nfd" in desc_low or "pick" in desc_low:
                            status_code = "NFD"

                        events.append(TrackingEvent(
                            status_code=status_code,
                            location=loc,
                            date=date_text,
                            pieces=ev_pcs,
                            flight=flight,
                            remarks=status_raw
                        ))
        
        # 3. Extract Delivery/Action Box events
        action_boxes = soup.find_all("afkl-action-box")
        for box in action_boxes:
            ul = box.find("ul", class_="caret")
            if not ul: continue
            for li in ul.find_all("li"):
                spans = li.find_all("span")
                texts = [s.get_text(strip=True) for s in spans if s.get_text(strip=True)]
                if len(texts) >= 4:
                    date_text = re.sub(r'[^a-zA-Z0-9\s:]', '', texts[1]).strip()
                    ev_pcs = None
                    m_pcs = re.search(r'(\d+)', texts[2])
                    if m_pcs: ev_pcs = m_pcs.group(1)
                    
                    action_text = texts[3]
                    act_low = action_text.lower()
                    
                    loc = None
                    m_loc = re.search(r'at\s+([A-Z]{3})', action_text)
                    if m_loc: loc = m_loc.group(1)
                    
                    flight = None
                    m_flight = re.search(r'from\s+([A-Z0-9]{5,6})', action_text, re.I)
                    if m_flight: flight = m_flight.group(1).upper()
                    
                    status_code = "UNKN"
                    if "deliver" in act_low: status_code = "DLV"
                    elif "receiv" in act_low: status_code = "RCF"
                    
                    if status_code != "UNKN":
                        events.append(TrackingEvent(
                            status_code=status_code,
                            location=loc,
                            date=date_text,
                            pieces=ev_pcs,
                            flight=flight,
                            remarks=action_text
                        ))
        
        return {
            "pieces": pieces,
            "weight": weight,
            "remarks": remarks,
            "events": events
        }


    async def track(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        """Offload sync UC/Selenium work to the shared browser executor."""
        return await self.run_sync(self._track_sync, awb, hawb=hawb, **kwargs)

    def _track_sync(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="074")
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
            chrome_path = get_uc_chrome_path()
            driver = uc.Chrome(options=options, browser_executable_path=chrome_path, headless=False, use_subprocess=True, version_main=133)
            driver.set_page_load_timeout(90)

            trace.append(f"navigating_to:{source_url}")
            driver.get(source_url)
            
            # Wait for Angular to render the milestones
            try:
                WebDriverWait(driver, 20).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "li.ng-star-inserted"))
                )
                trace.append("milestones_rendered")
            except Exception as e:
                trace.append(f"wait_failed:{str(e)[:50]}")
            
            # Additional wait for actual content
            time.sleep(5)

            html = driver.page_source

            if is_bot_blocked_html(html):
                blocked = True
                message = "Bot protection blocked the request."
            else:
                message = "Successfully loaded tracking data."

        except Exception as exc:
            message = f"AF-KLM tracking failed: {exc}"
            blocked = True
        finally:
            if driver:
                try:
                    driver.quit()
                except Exception:
                    pass

        # Parse logic
        parsed_data = self._parse_html(html)
        events = parsed_data.get("events", [])
        weight = parsed_data.get("weight")
        remarks = parsed_data.get("remarks")
        pieces = parsed_data.get("pieces")
        
        # Sort events by date (Format: 04 FEB 01:06)
        if events:
            now = datetime.now()
            current_year = now.year
            
            def parse_afkl_date(d_str):
                if not d_str:
                    return datetime.min
                try:
                    # Try with current year
                    dt = datetime.strptime(f"{d_str} {current_year}", "%d %b %H:%M %Y")
                    # If date is more than 6 months in future, assume last year
                    if (dt - now).days > 180:
                        dt = datetime.strptime(f"{d_str} {current_year - 1}", "%d %b %H:%M %Y")
                    return dt
                except:
                    return datetime.min

            events.sort(key=lambda x: parse_afkl_date(x.date))
        
        # Determine origin/destination based on sorted events
        origin, destination, status, flight = None, None, None, None
        
        if events:
            # First location
            origin = events[0].location
            # Last location that is different from origin, or last location
            dest_candidates = [e.location for e in reversed(events) if e.location and e.location != origin]
            destination = dest_candidates[0] if dest_candidates else origin
            
            status = events[-1].status_code
            flight = next((e.flight for e in reversed(events) if e.flight), None)

        # Update TrackingResponse initialization to include the new fields
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
