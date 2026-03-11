"""
Air France-KLM (AF-KLM) Cargo tracker.

Uses undetected-chromedriver to access https://www.afklcargo.com/mycargo/shipment/detail/{awb}.
The site is built with Angular and milestones are rendered dynamically.
"""

from __future__ import annotations

import re
import time
from typing import List

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from .base import AirlineTracker
from .common import (
    is_bot_blocked_html,
    normalize_awb,
    summarize_from_events,
)
from models import TrackingEvent, TrackingResponse


class AFKLMTracker(AirlineTracker):
    name = "afklm"
    base_url = "https://www.afklcargo.com/mycargo/shipment/detail/"

    def _extract_events_from_text(self, page_text: str) -> List[TrackingEvent]:
        """Extract events from page text using AF-KLM status patterns."""
        events: List[TrackingEvent] = []
        
        # AF-KLM format: 04 FEB 01:06 - 2 pieces delivered at TLV
        # Pattern: (DD MMM HH:mm) - (.*)
        lines = page_text.split("\n")
        for line in lines:
            line = line.strip()
            # Match 04 FEB 01:06 - ...
            m = re.search(r"(\d{2}\s+[A-Z]{3}\s+\d{2}:\d{2})\s*-\s*(.*)", line, re.IGNORECASE)
            if m:
                date_str = m.group(1).strip()
                description = m.group(2).strip()
                
                # Extract status code
                status_code = "UNKN"
                desc_low = description.lower()
                if any(k in desc_low for k in ["delivered", "dlv"]):
                    status_code = "DLV"
                elif any(k in desc_low for k in ["departed", "dep", "left", "flight"]):
                    status_code = "DEP"
                elif any(k in desc_low for k in ["arrived", "arr", "reached", "arrival"]):
                    status_code = "ARR"
                elif any(k in desc_low for k in ["received", "rcs", "accepted", "check", "warehouse"]):
                    status_code = "RCS"
                elif any(k in desc_low for k in ["booked", "bkd", "confirmed"]):
                    status_code = "BKD"
                elif any(k in desc_low for k in ["available", "nfd", "pick-up", "notified", "pickup"]):
                    status_code = "NFD"
                
                # Extract location (usually 3 uppercase letters)
                # Blacklist common 3-letter words and months that aren't airports
                BLACKLIST = {
                    "OUR", "THE", "VIA", "FOR", "AND", "ANY", "NOT", "PCS", "LBS", "KGS", "OUT", "GEN", "YES", "NON",
                    "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
                }
                location = None
                
                # Priority 1: 3-letter uppercase preceded by prepositions
                loc_match = re.search(r"\b(at|from|to|in|of|reached|for)\s+([A-Z]{3})\b", description, re.IGNORECASE)
                if loc_match:
                    found = loc_match.group(2).upper()
                    if found not in BLACKLIST:
                        location = found
                
                # Priority 2: Any 3-letter uppercase in description that is NOT blacklisted
                if not location:
                    all_locs = re.findall(r"\b([A-Z]{3})\b", description)
                    for l in all_locs:
                        if l.upper() not in BLACKLIST:
                            location = l.upper()
                            break

                events.append(
                    TrackingEvent(
                        status_code=status_code,
                        location=location,
                        date=date_str,
                        description=description[:200]
                    )
                )
        
        return events

    async def track(self, awb: str) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="074")
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

            # Extract text carefully preserving structure
            page_text = driver.execute_script("""
                function getAllText(node) {
                    let text = "";
                    if (node.nodeType === Node.TEXT_NODE) {
                        text += node.textContent + " ";
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        const style = window.getComputedStyle(node);
                        if (style.display === 'block' || style.display === 'flex' || node.tagName === 'LI' || node.tagName === 'TR' || node.tagName === 'P' || node.tagName === 'DIV') {
                            text += "\\n";
                        }
                        if (node.shadowRoot) {
                            text += getAllText(node.shadowRoot);
                        }
                        for (let child of node.childNodes) {
                            text += getAllText(child);
                        }
                        if (style.display === 'block' || style.display === 'flex' || node.tagName === 'P' || node.tagName === 'DIV') {
                            text += "\\n";
                        }
                    }
                    return text;
                }
                return getAllText(document.body);
            """)

            html = driver.page_source

            # Save debug files
            try:
                with open("/tmp/afklm_last_html.html", "w") as f: f.write(html)
                with open("/tmp/afklm_last_text.txt", "w") as f: f.write(page_text)
            except: pass

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

        events = self._extract_events_from_text(page_text)
        
        # Sort events by date (Format: 04 FEB 01:06)
        if events:
            from datetime import datetime
            now = datetime.now()
            current_year = now.year
            
            def parse_afkl_date(d_str):
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
        
        # Better summarization
        origin, destination, status, flight = None, None, None, None
        
        # Try finding Origin/Destination from the header area first (e.g. " BOS   TLV ")
        header_match = re.search(r"\b([A-Z]{3})\s+([A-Z]{3})\b", page_text)
        if header_match:
            origin = header_match.group(1).upper()
            destination = header_match.group(2).upper()

        if events:
            # Origin fallback if not in header
            if not origin:
                origin = next((e.location for e in events if e.location and len(e.location) == 3), events[0].location)
            # Destination fallback if not in header
            if not destination or destination == origin:
                destination = next((e.location for e in reversed(events) if e.location and len(e.location) == 3 and e.location != origin), None)
            
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
                "text_length": len(page_text),
                "event_count": len(events),
                "trace": trace
            },
        )
