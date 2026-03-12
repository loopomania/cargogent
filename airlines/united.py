"""
United Cargo tracker.

Uses undetected-chromedriver to access https://www.unitedcargo.com/en/us/track/awb/{awb}.
The site is built with React and Ant Design components.
Results auto-load upon direct navigation.
"""

from __future__ import annotations

import re
import time
from datetime import datetime
from typing import List

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains

from .base import AirlineTracker
from .common import (
    is_bot_blocked_html,
    normalize_awb,
    summarize_from_events,
)
from models import TrackingEvent, TrackingResponse


class UnitedTracker(AirlineTracker):
    name = "united"
    base_url = "https://www.unitedcargo.com/en/us/track/awb/"

    def _extract_events_from_dom(self, driver) -> List[TrackingEvent]:
        """Extract events directly from DOM components as React text can be fragmented."""
        events: List[TrackingEvent] = []
        
        # Select Ant Design steps representing the milestones
        try:
            items = driver.find_elements(By.CSS_SELECTOR, ".ant-steps-item")
            for item in items:
                try:
                    title_el = item.find_element(By.CSS_SELECTOR, ".ant-steps-item-title .title")
                    subtitle_el = item.find_element(By.CSS_SELECTOR, ".ant-steps-item-title .subtitle")
                    
                    description = title_el.text.strip()
                    timestamp = subtitle_el.text.strip() # Usually format: MM/DD/YYYY HH:MM
                    
                    # Try to extract extra info if available in the content area
                    BLACKLIST = {
                        "QTY", "LBS", "KGS", "PCS", "CBM", "MCW", "CHW", "VOL", "AWB", "SHC",
                        "DLV", "ARR", "DEP", "RCS", "BKD", "MAN", "NFD", "TFD", "RCC", "PRE",
                        "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
                    }
                    location = None
                    flight = None
                    
                    # Get all text from the item to search for flight and location
                    item_text = item.text
                    
                    # Flight number: Usually UA plus digits
                    flight_match = re.search(r"\b(UA\d{3,4})\b", item_text)
                    if flight_match:
                        flight = flight_match.group(1).upper()

                    # Location extraction
                    # Try finding loc in content area specifically
                    try:
                        content_el = item.find_element(By.CSS_SELECTOR, ".ant-steps-item-content")
                        content_text = content_el.text
                        loc_matches = re.findall(r"\b([A-Z]{3})\b", content_text)
                        for loc in loc_matches:
                            if loc.upper() not in BLACKLIST and loc.upper() != "UA":
                                location = loc.upper()
                                break
                    except:
                        pass
                    
                    if not location:
                        # Fallback: check whole item text
                        loc_matches = re.findall(r"\b([A-Z]{3})\b", item_text)
                        for loc in loc_matches:
                            if loc.upper() not in BLACKLIST and loc.upper() != "UA":
                                location = loc.upper()
                                break

                    # Map status code
                    status_code = "UNKN"
                    desc_low = description.lower()
                    if any(k in desc_low for k in ["delivered", "dlv"]):
                        status_code = "DLV"
                    elif any(k in desc_low for k in ["departed", "dep", "flying", "in flight"]):
                        status_code = "DEP"
                    elif any(k in desc_low for k in ["arrived", "arr", "at station"]):
                        status_code = "ARR"
                    elif any(k in desc_low for k in ["received", "rcs", "accepted", "shipper"]):
                        status_code = "RCS"
                    elif any(k in desc_low for k in ["booked", "bkd", "confirmed"]):
                        status_code = "BKD"
                    elif any(k in desc_low for k in ["available", "nfd", "ready", "pick up"]):
                        status_code = "NFD"

                    events.append(
                        TrackingEvent(
                            status_code=status_code,
                            location=location,
                            date=timestamp,
                            remarks=description[:200],
                            flight=flight
                        )
                    )
                except:
                    continue
        except Exception as e:
            print(f"DOM extraction failed: {e}")
            
        return events

    async def track(self, awb: str) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="016")
        awb_fmt = f"{prefix}-{serial}"
        message = "Success"
        blocked = False
        html = ""
        page_text = ""
        source_url = f"{self.base_url}{awb_fmt}"
        trace = []

        options = uc.ChromeOptions()
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1920,1080")

        driver = None
        try:
            driver = uc.Chrome(options=options, headless=False, use_subprocess=True)
            driver.set_page_load_timeout(90)

            trace.append(f"navigating_to:{source_url}")
            driver.get(source_url)
            
            # Wait for React to render the summary
            try:
                WebDriverWait(driver, 20).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "div.css-ifennn.e1dcmvpd8"))
                )
                trace.append("summary_rendered")
            except:
                trace.append("summary_wait_timeout")

            # Try to expand Movement Details
            try:
                expand_header = WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, ".ant-collapse-header"))
                )
                # Scroll and click
                driver.execute_script("arguments[0].scrollIntoView(true);", expand_header)
                time.sleep(1)
                ActionChains(driver).move_to_element(expand_header).click().perform()
                trace.append("expanded_movement_details")
                time.sleep(2)
            except Exception as e:
                trace.append(f"expand_failed:{str(e)[:50]}")

            # Extract milestones from DOM
            events = self._extract_events_from_dom(driver)
            trace.append(f"extracted_{len(events)}_events_from_dom")

            html = driver.page_source
            page_text = driver.execute_script("return document.body.innerText")

            # Save debug files
            try:
                with open("/tmp/united_last_html.html", "w") as f: f.write(html)
                with open("/tmp/united_last_text.txt", "w") as f: f.write(page_text)
            except: pass

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

        # Helper for date parsing
        def parse_u_date(d):
            try:
                if "/" in d: return datetime.strptime(d, "%m/%d/%Y %H:%M")
                return datetime.strptime(d, "%Y-%m-%d %H:%M")
            except: return datetime.min

        # Sort events by date if possible
        if events:
            try:
                events.sort(key=lambda x: parse_u_date(x.date))
            except:
                pass
        
        # Better summarization
        origin, destination, status, flight = None, None, None, None
        
        # Look for Origin and Destination in the header area above the AWB
        # They usually appear as two 3-letter codes followed by the AWB
        header_match = re.search(r"([A-Z]{3})\s*\n\s*([A-Z]{3})\s*\n\s*" + re.escape(awb_fmt), page_text)
        if header_match:
            origin = header_match.group(1).upper()
            destination = header_match.group(2).upper()
        
        if not origin or not destination:
            # Fallback: look for "([A-Z]{3}) [A-Z]{3}" followed by AWB in flat text
            flat_text = page_text.replace("\n", " ")
            overview_match = re.search(r"([A-Z]{3})\s+([A-Z]{3})\s+" + re.escape(awb_fmt), flat_text)
            if overview_match:
                origin = overview_match.group(1).upper()
                destination = overview_match.group(2).upper()

        # Build a date-indexed location map from summary section
        # Format: "Actual Departure (EWR): Feb 10, 2026"
        loc_map = {'Departure': {}, 'Arrival': {}}
        for match in re.finditer(r"Actual (Departure|Arrival)\s+\(([A-Z]{3})\):\s+([A-Za-z]{3}\s+\d{1,2})", page_text):
            l_type, l_code, l_date = match.groups()
            # Standardize date format to "MMM DD" (e.g. "Feb 10")
            loc_map[l_type][l_date] = l_code.upper()

        if events:
            # Enrich events
            for e in events:
                if not e.location and e.date:
                    try:
                        dt = parse_u_date(e.date)
                        date_key = dt.strftime("%b %d") # "Feb 10"
                        if e.status_code == "DEP":
                            e.location = loc_map['Departure'].get(date_key)
                        elif e.status_code == "ARR":
                            e.location = loc_map['Arrival'].get(date_key)
                        elif "Delivered" in (e.remarks or ""):
                            e.location = destination
                    except:
                        pass
                
                # Still missing? Look for "at [LOC]" in remarks
                if not e.location and e.remarks:
                    at_match = re.search(r"\bat\s+([A-Z]{3})\b", e.remarks, re.IGNORECASE)
                    if at_match:
                        e.location = at_match.group(1).upper()

            if not origin:
                # Try finding RCS/BKD location for origin
                origin = next((e.location for e in events if e.location and len(e.location) == 3), None)
            if not destination:
                # Try finding DLV/ARR location for destination
                destination = next((e.location for e in reversed(events) if e.location and len(e.location) == 3), None)
            
            status = events[-1].status_code
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
                "trace": trace
            },
        )
