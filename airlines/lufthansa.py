import re
import time
from typing import List

from bs4 import BeautifulSoup
import undetected_chromedriver as uc
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By

from .base import AirlineTracker
from .common import (
    track_trace_query,
    clean_text,
    is_bot_blocked_html,
    parse_events_from_html_table,
    summarize_from_events,
)
from models import TrackingEvent, TrackingResponse
import requests


class LufthansaTracker(AirlineTracker):
    name = "lufthansa"
    tracking_url = "https://www.lufthansa-cargo.com/en/eservices/etracking"

    def _parse_fallback_events(self, html: str) -> List[TrackingEvent]:
        soup = BeautifulSoup(html, "html.parser")
        rows = []
        for tr in soup.find_all("tr"):
            cells = [clean_text(c.get_text(" ", strip=True)) for c in tr.find_all(["td", "th"])]
            cells = [c for c in cells if c]
            if len(cells) >= 3 and any(re.search(r"\d{1,2}\s+[A-Za-z]{3}\s+\d{2,4}", c) for c in cells):
                rows.append(cells)
        events = []
        for cells in rows:
            events.append(
                TrackingEvent(
                    status=cells[0] if len(cells) > 0 else None,
                    location=cells[1] if len(cells) > 1 else None,
                    date=cells[2] if len(cells) > 2 else None,
                    remarks=" | ".join(cells[3:]) if len(cells) > 3 else None,
                )
            )
        return events

    async def track(self, awb: str) -> TrackingResponse:
        awb_clean = awb.replace("-", "").replace(" ", "")
        message = "Success"
        blocked = False
        html = ""
        source_url = f"https://www.lufthansa-cargo.com/en/eservices/etracking/awb-details/-/awb/{awb_clean[:3]}/{awb_clean[3:]}?searchFilter=awb"
        
        options = uc.ChromeOptions()
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_argument("--disable-infobars")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--disable-extensions")
        options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        
        driver = None
        try:
            driver = uc.Chrome(options=options, headless=False, use_subprocess=False)
            driver.set_page_load_timeout(60)
            driver.get(source_url)
            
            # Wait for content to load
            time.sleep(5)
            
            # Handle cookie consent
            try:
                accept_btn = driver.find_element(By.ID, "uc-btn-accept-banner")
                if accept_btn.is_displayed():
                    accept_btn.click()
                    time.sleep(2)
            except:
                try:
                    # Alternative selector if ID is different
                    accept_btn = driver.find_element(By.XPATH, "//button[contains(text(), 'Accept all')]")
                    accept_btn.click()
                    time.sleep(2)
                except:
                    pass

            time.sleep(10) # Wait for page to finish loading data after consent
            
            # Extract text from the whole page including Shadow DOM to catch React-rendered details
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
            
            if is_bot_blocked_html(html) or "just a moment" in html.lower():
                blocked = True
                message = "Cloudflare Turnstile JS challenge blocking access."
            else:
                message = "Successfully loaded tracking data."
                driver.save_screenshot("lufthansa_debug.png")
                with open("lufthansa_debug.html", "w") as f:
                    f.write(html)
                with open("lufthansa_debug_text.txt", "w") as f:
                    f.write(page_text)
        except Exception as exc:
            message = f"Undetected-chromedriver fetch failed: {exc}"
            blocked = True
            page_text = ""
        finally:
            if driver:
                try:
                    driver.quit()
                except:
                    pass

        # Try parsing from standard tables first
        events = parse_events_from_html_table(html)
        
        # If no events found via standard tables, use the text-based extraction
        if not events and not blocked:
            # Improved regex to handle various Lufthansa date/time formats
            # Looking for patterns like: BKD 26 FEB / 17:23 1 pcs TLV
            pattern = r"(BKD|RCS|DEP|ARR|RCF|NFD|DLV|MAN|DIS)\s+(\d{2}\s+[A-Z]{3})\s*(?:/)?\s*(\d{2}:\d{2})\s*(\d+)?\s*(?:pcs)?\s*([A-Z]{3})"
            matches = re.finditer(pattern, page_text)
            for m in matches:
                groups = m.groups()
                status_code = groups[0]
                date_part = groups[1]
                time_part = groups[2]
                pieces = groups[3] or "1"
                location = groups[4]
                
                events.append(
                    TrackingEvent(
                        status_code=status_code,
                        location=location,
                        date=f"{date_part} {time_part}",
                        pieces=pieces,
                        remarks="Extracted from milestone text",
                    )
                )
                events.append(
                    TrackingEvent(
                        status_code=status_code,
                        location=location,
                        date=f"{date_part} {time_part}",
                        pieces=pieces,
                        remarks="Extracted from milestone text",
                    )
                )
            
            # Fallback 2: Check for broad "Latest event" text if matches failed
            if not events:
                latest_m = re.search(r"Latest event:\s+([A-Z]{3})\s*-\s*(.*?)(?=\s+Origin|\s+Destination|$)", page_text)
                if latest_m:
                    events.append(
                        TrackingEvent(
                            status_code=latest_m.group(1),
                            remarks=latest_m.group(2).strip(),
                        )
                    )

        origin, destination, status, flight = summarize_from_events(events)
        
        # If origin/destination still null, try extracting from text
        if not origin:
            m = re.search(r"Origin\s+Destination\s+([A-Z]{3})\s+([A-Z]{3})", page_text)
            if m:
                origin, destination = m.groups()

        return TrackingResponse(
            airline=self.name,
            awb=awb_clean,
            origin=origin,
            destination=destination,
            status=status,
            flight=flight,
            events=events,
            blocked=blocked,
            message=message,
            raw_meta={"source_url": source_url},
        )


