from __future__ import annotations
import logging
import re
import time
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from typing import List, Optional
from datetime import datetime

from .base import AirlineTracker
from .common import normalize_awb, get_uc_chrome_path
from .proxy_util import get_rotating_proxy, get_proxy_extension
from models import TrackingResponse, TrackingEvent

logger = logging.getLogger(__name__)

class EthiopianTracker(AirlineTracker):
    name = "ethiopian"
    base_url = "https://cargo.ethiopianairlines.com/my-cargo/track-your-shipment"

    async def track(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        """Offload sync UC/Selenium work to the shared browser executor."""
        return await self.run_sync(self._track_sync, awb, hawb=hawb, **kwargs)

    def _track_sync(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="071")
        full_awb = f"{prefix}{serial}"
        trace = []
        
        options = uc.ChromeOptions()
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--disable-gpu")
        
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
            trace.append("chrome_started")
            
            driver.get(self.base_url)
            time.sleep(5)
            trace.append("page_loaded")
            
            wait = WebDriverWait(driver, 20)
            
            # Input AWB
            try:
                awb_input = wait.until(EC.element_to_be_clickable((By.ID, "AirwayBilNum")))
                awb_input.clear()
                for char in full_awb:
                    awb_input.send_keys(char)
                    time.sleep(0.1)
                trace.append("awb_input_done")
                
                # Click Search
                search_btn = driver.find_element(By.CSS_SELECTOR, "button.et-submit-btn")
                driver.execute_script("arguments[0].click();", search_btn)
                trace.append("search_clicked")
                
                time.sleep(10)
            except Exception as e:
                trace.append(f"interaction_failed: {str(e)[:50]}")

            # Wait for results
            try:
                wait.until(EC.presence_of_element_located((By.XPATH, "//h2[contains(text(), 'AWB No')]")))
                trace.append("results_detected")
            except:
                trace.append("results_timeout")

            # Scrape basic info
            status = "In Transit"
            origin = None
            dest = None
            
            try:
                # Find labels then their values in the whole page
                # The labels are often in divs or spans
                all_divs = driver.find_elements(By.TAG_NAME, "div")
                for i, div in enumerate(all_divs):
                    text = div.text.strip()
                    if text == "Origin" and i + 1 < len(all_divs):
                        origin = all_divs[i+1].text.strip()
                    elif text == "Destination" and i + 1 < len(all_divs):
                        dest = all_divs[i+1].text.strip()
                
                # If still not found, try a different selector
                if not origin or not dest:
                    headers = driver.find_elements(By.CSS_SELECTOR, ".et-track-header-item")
                    for item in headers:
                        text = item.text.strip()
                        if "Origin" in text:
                            origin = item.find_element(By.XPATH, "./following-sibling::div").text.strip()
                        elif "Destination" in text:
                            dest = item.find_element(By.XPATH, "./following-sibling::div").text.strip()
            except:
                pass

            # Scrape events
            events = self._scrape_events(driver)
            if events:
                status = events[-1].status if events else "UNKN"
                # Fallback for origin/dest if not found in header
                # We want the FIRST non-None location for origin, LAST for dest
                if not origin:
                    origin = next((e.location for e in events if e.location), None)
                if not dest:
                    dest = next((e.location for e in reversed(events) if e.location), None)

            return TrackingResponse(
                awb=f"{prefix}-{serial}",
                airline="Ethiopian Airlines",
                origin=origin,
                destination=dest,
                status=status,
                events=events,
                raw_meta={"trace": trace, "events_count": len(events)}
            )

        except Exception as e:
            logger.error(f"Ethiopian tracking failed: {str(e)}")
            return TrackingResponse(
                awb=awb,
                airline="Ethiopian Airlines",
                status="Error",
                events=[],
                raw_meta={"error": str(e), "trace": trace}
            )
        finally:
            if driver:
                driver.quit()

    def _scrape_events(self, driver) -> List[TrackingEvent]:
        # Text-based extraction from results
        extraction_script = """
        const events = [];
        const allText = document.body.innerText;
        const historyStart = allText.indexOf('Shipment History');
        if (historyStart !== -1) {
            const historyText = allText.substring(historyStart);
            const lines = historyText.split('\\n').map(l => l.trim()).filter(l => l);
            // Walk through lines looking for timestamp pattern: 26-Jan-26 10:57:00
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const timeMatch = line.match(/^(\\d{2}-[A-Z][a-z]{2}-\\d{2}\\s+\\d{2}:\\d{2}:\\d{2})$/);
                if (timeMatch) {
                    const time = timeMatch[1];
                    // Status is usually 2 lines back, remarks 1 line back
                    // But if it is stacked differently, we backtrack until we find lines that aren't timestamps or headers
                    let status = lines[i-2] || "";
                    let remarks = lines[i-1] || "";
                    
                    // If we find pieces pattern in "status", it means we offset by 1
                    if (status.includes('/') || status.includes('|') || status.includes('Pcs')) {
                        status = lines[i-3] || "Status";
                        remarks = lines[i-2] + " | " + lines[i-1];
                    }

                    events.push({
                        date: time,
                        status: status,
                        remarks: remarks
                    });
                }
            }
        }
        return events;
        """
        
        try:
            raw_events = driver.execute_script(extraction_script)
            results = []
            
            # Helper for mapping status codes
            def get_status_code(status_text: str) -> str:
                s = status_text.lower()
                if "delivered" in s: return "DLV"
                if "departed" in s or "flight" in s: return "DEP"
                if "arrived" in s: return "ARR"
                if "received" in s or "rcs" in s or "accepted" in s: return "RCS"
                if "booked" in s: return "BKD"
                if "manifest" in s: return "MAN"
                if "ready" in s or "pickup" in s: return "NFD"
                return "UNKN"

            for ev in raw_events:
                remarks = ev.get("remarks", "")
                pieces = None
                weight = None
                flight = None
                location = None
                
                # Parse pieces: e.g., "20/20 Pcs"
                pc_match = re.search(r"(\d+)/\d+\s+Pcs", remarks, re.IGNORECASE)
                if pc_match:
                    pieces = pc_match.group(1)
                
                # Parse weight: e.g., "208.0 Kg"
                wt_match = re.search(r"([\d.]+)\s*Kg", remarks, re.IGNORECASE)
                if wt_match:
                    weight = wt_match.group(1) + " KG"
                
                # Parse flight: e.g., "on ET629"
                fl_match = re.search(r"on\s+(ET\d{3,4})", remarks, re.IGNORECASE)
                if fl_match:
                    flight = fl_match.group(1).upper()
                
                # Parse location: "from CGK to ADD" or "at ADD"
                # If "Departed", we want the "from" station.
                # If "Arrived", we want the "to" or "at" station.
                s_lower = ev.get("status", "").lower()
                from_match = re.search(r"from\s+([A-Z]{3})", remarks, re.IGNORECASE)
                to_match = re.search(r"to\s+([A-Z]{3})", remarks, re.IGNORECASE)
                at_match = re.search(r"at\s+([A-Z]{3})", remarks, re.IGNORECASE)

                if "departed" in s_lower and from_match:
                    location = from_match.group(1).upper()
                elif ("arrived" in s_lower or "delivered" in s_lower) and (to_match or at_match):
                    location = (to_match or at_match).group(1).upper()
                elif from_match: # Fallback
                    location = from_match.group(1).upper()
                elif at_match:
                    location = at_match.group(1).upper()
                elif to_match:
                    location = to_match.group(1).upper()
                else:
                    # Last resort: find any 3-letter code
                    loc_pattern = re.findall(r"\b([A-Z]{3})\b", remarks)
                    if loc_pattern:
                        location = loc_pattern[-1]

                results.append(TrackingEvent(
                    status_code=get_status_code(ev.get("status", "")),
                    status=ev.get("status"),
                    location=location,
                    date=ev.get("date"),
                    pieces=pieces,
                    weight=weight,
                    remarks=remarks,
                    flight=flight
                ))
            
            # Sort events (Ethiopian sometimes shows them reversed)
            # Format: "26-Jan-26 10:57:00"
            def parse_date(d_str):
                try:
                    return datetime.strptime(d_str, "%d-%b-%y %H:%M:%S")
                except:
                    return datetime.min

            results.sort(key=lambda x: parse_date(x.date))
            
            return results
        except Exception as e:
            logger.error(f"Ethiopian scraping error: {e}")
            return []
