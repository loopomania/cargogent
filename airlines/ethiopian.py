from __future__ import annotations
import logging
import time
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from typing import List, Optional

from .base import AirlineTracker
from .common import normalize_awb
from models import TrackingResponse, TrackingEvent

logger = logging.getLogger(__name__)

class EthiopianTracker(AirlineTracker):
    name = "ethiopian"
    base_url = "https://cargo.ethiopianairlines.com/my-cargo/track-your-shipment"

    async def track(self, awb: str) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="071")
        # Ethiopian seems to want the full AWB or just the serial. 
        # Based on research, the input ID is AirwayBilNum.
        full_awb = f"{prefix}{serial}"
        trace = []
        
        options = uc.ChromeOptions()
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--disable-gpu")
        
        driver = None
        try:
            driver = uc.Chrome(options=options, headless=False, use_subprocess=True)
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
                driver.save_screenshot("ethiopian_timeout.png")

            # Scrape basic info
            status = "In Transit"
            origin = None
            dest = None
            
            try:
                # Find labels then their values
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
                status = events[0].status

            return TrackingResponse(
                awb=awb,
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
        extraction_script = """
        const results = [];
        const historyRows = document.querySelectorAll('.et-track-history-item');
        
        historyRows.forEach(row => {
            const statusBox = row.querySelector('.et-track-history-status');
            const status = statusBox ? statusBox.innerText.trim() : "";
            
            const detailBox = row.querySelector('.et-track-history-detail');
            const remarks = detailBox ? detailBox.innerText.trim() : "";
            
            const timeBox = row.querySelector('.et-track-history-time');
            const time = timeBox ? timeBox.innerText.trim() : "";
            
            if (status || time) {
                results.push({
                    status: status,
                    remarks: remarks,
                    time: time,
                    location: "" // Location often embedded in remarks
                });
            }
        });
        return results;
        """
        # Wait, let me double check the class names from the screenshot.
        # Actually I can use a more generic text-based extraction if classes are tricky.
        # From screenshot, it looks like:
        # Each event has a circle, then Status, then details (pieces, weight, flight), then Date/Time on the far right.
        
        # I'll use the script from the research or a revised one.
        # Let's try to extract from the list structure.
        
        extraction_script = """
        const events = [];
        // The container seems to be a list of events.
        // Each entry has a label (Status), a description (pieces, etc.), and a timestamp.
        
        const historyItems = Array.from(document.querySelectorAll('div')).filter(el => {
            return el.innerText && el.innerText.includes('Shipment History');
        });
        
        if (historyItems.length > 0) {
            const container = historyItems[0].parentElement;
            // Based on visual layout: Circle -> Status -> Details -> Timestamp
            // Let's look for the rows.
            const rows = container.querySelectorAll('.row, div[style*="border-bottom"]'); // Approximation
            // Actually, let's use the innerText strategy if selectors are unknown.
            
            const allText = document.body.innerText;
            const historyStart = allText.indexOf('Shipment History');
            if (historyStart !== -1) {
                const historyText = allText.substring(historyStart);
                const lines = historyText.split('\\n').map(l => l.trim()).filter(l => l);
                // First valid line is "Shipment History"
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i];
                    // Potential status line. Let's look for the timestamp pattern.
                    // Timestamp: "26-Jan-26 10:57:00"
                    const timeMatch = line.match(/\\d{2}-[A-Z][a-z]{2}-\\d{2}\\s+\\d{2}:\\d{2}:\\d{2}/);
                    if (timeMatch) {
                        const time = timeMatch[0];
                        // The status might be a few lines back.
                        // For example:
                        // Delivered
                        // 3/3 Pcs | ...
                        // 26-Jan-26 10:57:00
                        let status = lines[i-2] || "";
                        let remarks = lines[i-1] || "";
                        
                        // If status is too long or looks like remarks, adjust.
                        if (status.includes('|')) {
                             status = lines[i-3] || "Status";
                             remarks = lines[i-2] + " | " + lines[i-1];
                        }

                        events.push({
                            time: time,
                            status: status,
                            remarks: remarks,
                            location: ""
                        });
                    }
                }
            }
        }
        return events;
        """
        
        try:
            raw_events = driver.execute_script(extraction_script)
            results = []
            for ev in raw_events:
                results.append(TrackingEvent(
                    time=ev.get("time"),
                    status=ev.get("status"),
                    remarks=ev.get("remarks"),
                    location=ev.get("location")
                ))
            return results
        except Exception as e:
            logger.error(f"Ethiopian scraping error: {e}")
            return []
