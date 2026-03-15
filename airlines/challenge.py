from __future__ import annotations
import logging
import time
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from typing import List, Optional

from .base import AirlineTracker
from .common import normalize_awb
from models import TrackingResponse, TrackingEvent

logger = logging.getLogger(__name__)

class ChallengeTracker(AirlineTracker):
    name = "challenge"
    base_url = "https://www.challenge-group.com/tracking/"

    async def track(self, awb: str) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="700")
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
                # Based on research, fields are Pre1 and AWB1
                pre_input = wait.until(EC.element_to_be_clickable((By.ID, "Pre1")))
                awb_input = driver.find_element(By.ID, "AWB1")
                
                pre_input.clear()
                pre_input.send_keys(prefix)
                
                awb_input.clear()
                awb_input.send_keys(serial)
                
                trace.append("awb_input_done")
                
                # Click Submit
                submit_btn = driver.find_element(By.CSS_SELECTOR, ".submit_tracking")
                driver.execute_script("arguments[0].click();", submit_btn)
                trace.append("submit_clicked")
                
                time.sleep(10)
            except Exception as e:
                trace.append(f"interaction_failed: {str(e)[:50]}")

            # Check for error message
            html = driver.page_source
            if "Error: No results were found" in html:
                trace.append("not_found")
                return TrackingResponse(
                    awb=awb,
                    airline="Challenge Group",
                    status="Not Found",
                    events=[],
                    message="No results were found",
                    raw_meta={"trace": trace}
                )

            # Scrape basic info and events
            events = self._scrape_events(driver)
            
            status = "In Transit"
            if events:
                status = events[0].status
            
            # Extract Origin/Destination from the first event if possible
            # Usually 'FROM' and 'TO' columns in the table
            origin = events[-1].location if events else None # First event in time is usually at the bottom
            dest = events[0].location if events else None

            return TrackingResponse(
                awb=awb,
                airline="Challenge Group",
                origin=origin,
                destination=dest,
                status=status,
                events=events,
                raw_meta={"trace": trace, "events_count": len(events)}
            )

        except Exception as e:
            logger.error(f"Challenge tracking failed: {str(e)}")
            return TrackingResponse(
                awb=awb,
                airline="Challenge Group",
                status="Error",
                events=[],
                raw_meta={"error": str(e), "trace": trace}
            )
        finally:
            if driver:
                driver.quit()

    def _scrape_events(self, driver) -> List[TrackingEvent]:
        # Based on research, results are in a structured layout. 
        # I'll use a script to extract the columns.
        extraction_script = """
        const results = [];
        // Look for the tracking results container
        // Based on research, it has headers like FROM, TO, SERVICE, BY, ETD/ATD, ETA/ATA, PCS, WEIGHT
        
        // Find all rows in the results table/list
        // The subagent reported it's structured below the form.
        // Let's look for elements that look like tracking rows.
        
        const rows = Array.from(document.querySelectorAll('.row')).filter(r => {
            return r.innerText.includes('FROM') === false && r.querySelector('.tracking-details-button') !== null;
        });

        rows.forEach(row => {
            const cols = row.querySelectorAll('div');
            if (cols.length >= 8) {
                // Approximate mapping based on subagent report:
                // FROM, TO, SERVICE, BY, ETD/ATD, ETA/ATA, PCS, WEIGHT
                const fromLoc = cols[0] ? cols[0].innerText.trim() : "";
                const toLoc = cols[1] ? cols[1].innerText.trim() : "";
                const flt = cols[3] ? cols[3].innerText.trim() : "";
                const depTime = cols[4] ? cols[4].innerText.trim() : "";
                const arrTime = cols[5] ? cols[5].innerText.trim() : "";
                const pcs = cols[6] ? cols[6].innerText.trim() : "";
                const wgt = cols[7] ? cols[7].innerText.trim() : "";
                
                // We'll create one event for Arrival usually, or Departure.
                // Or map them to the schema.
                results.push({
                    location: toLoc || fromLoc,
                    status: "ARR",
                    date: arrTime || depTime,
                    pieces: pcs,
                    weight: wgt,
                    remarks: `From ${fromLoc} to ${toLoc}`,
                    flight: flt
                });
            }
        });
        return results;
        """
        
        try:
            raw_events = driver.execute_script(extraction_script)
            results = []
            for ev in raw_events:
                results.append(TrackingEvent(
                    location=ev.get("location"),
                    status_code=ev.get("status"), # Generic
                    date=ev.get("date"),
                    pieces=ev.get("pieces"),
                    weight=ev.get("weight"),
                    remarks=ev.get("remarks"),
                    flight=ev.get("flight")
                ))
            return results
        except Exception as e:
            logger.error(f"Challenge scraping error: {e}")
            return []
