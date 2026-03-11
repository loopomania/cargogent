from __future__ import annotations

import re
import time
import undetected_chromedriver as uc
from typing import Optional

from .base import AirlineTracker
from .common import (
    is_bot_blocked_html,
    normalize_awb,
    summarize_from_events,
)
from models import TrackingResponse, TrackingEvent


class ElAlTracker(AirlineTracker):
    name = "elal"
    # Legacy URL pattern suggested by user
    base_url = "https://www.elalextra.net/info/awb.asp?aid=114&awb={serial}&Lang=Eng"

    async def track(self, awb: str) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="114")
        awb_fmt = f"{prefix}-{serial}"
        message = "Success"
        blocked = False
        html = ""
        source_url = self.base_url.format(serial=serial)
        
        options = uc.ChromeOptions()
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_argument("--disable-infobars")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--disable-extensions")
        options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        
        driver = None
        page_text = ""
        try:
            driver = uc.Chrome(options=options, headless=False, use_subprocess=False)
            driver.set_page_load_timeout(60)
            driver.get(source_url)
            
            # Wait for content to load
            time.sleep(10)
            
            # Extract text from the whole page including Shadow DOM
            page_text = driver.execute_script("""
                function getAllText(node) {
                    let text = " ";
                    if (node.nodeType === Node.TEXT_NODE) {
                        text += node.textContent + " ";
                    }
                    if (node.shadowRoot) {
                        text += getAllText(node.shadowRoot);
                    }
                    if (node.childNodes) {
                        for (let child of node.childNodes) {
                            text += getAllText(child);
                        }
                    }
                    return text;
                }
                return getAllText(document.body);
            """)

            html = driver.page_source
            
            if is_bot_blocked_html(html) or "access an outdated page" in html.lower():
                blocked = True
                message = "Bot protection or session validation blocked the request."
            else:
                message = "Successfully loaded tracking data."
        except Exception as exc:
            message = f"Undetected-chromedriver fetch failed: {exc}"
            blocked = True
        finally:
            if driver:
                try:
                    driver.quit()
                except:
                    pass

        events = []
        # Parse events from captured text stream
        # Example format: FOH TLV 05 Jan 26 22:04 1 4.0
        # Refined regex with non-greedy remarks and lookahead for next event or MSG/end
        pattern = r"([A-Z]{3})\s+([A-Z]{3})\s+(\d{2}\s+[A-Z][a-z]{2}\s+\d{2})\s+(\d{2}:\d{2})\s+(\d+)\s+([\d.]+)\s*(.*?)(?=\s+[A-Z]{3}\s+[A-Z]{3}\s+\d{2}|$|MSG)"
        matches = re.finditer(pattern, page_text)
        for m in matches:
            status_code, location, date_part, time_part, pieces, weight, remarks = m.groups()
            events.append(
                TrackingEvent(
                    status_code=status_code,
                    location=location,
                    date=f"{date_part} {time_part}",
                    pieces=pieces,
                    weight=weight,
                    remarks=remarks.strip(),
                )
            )

        origin, destination, status, flight = summarize_from_events(events)
        
        # Fallback for origin/destination if events list is empty or header extraction is needed
        if not origin:
            m = re.search(r"Origin\s+Destination\s+.*?\s+([A-Z]{3})\s+([A-Z]{3})", page_text)
            if m:
                origin, destination = m.groups()

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
            raw_meta={"source_url": source_url},
        )
