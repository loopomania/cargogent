from __future__ import annotations
import logging
import time
import re
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from typing import List, Optional

from .base import AirlineTracker
from .common import normalize_awb
from .proxy_util import get_rotating_proxy, get_proxy_extension
from models import TrackingResponse, TrackingEvent

logger = logging.getLogger(__name__)

class ChallengeTracker(AirlineTracker):
    name = "challenge"
    base_url = "https://www.challenge-group.com/tracking/"

    async def track(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="700")
        trace = []
        
        options = uc.ChromeOptions()
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--disable-gpu")
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
            driver = uc.Chrome(options=options, headless=False, use_subprocess=True, version_main=146)
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
            
            # Extract Origin/Destination
            # Origin is the start of the first segment, Destination is the end of the last segment
            if events:
                # events[0] is most recent, events[-1] is oldest
                # My new JS sets location to 'To' city.
                # So events[-1].location is the destination of the first segment.
                # We also want the origin of the first segment.
                # I'll update the JS to return more info or handle it here.
                dest = events[0].location
                # For origin, we might need to parse it from remarks if we don't return it explicitly
                # Or just use the summary information from the table if available.
                origin = None
                if events[-1].remarks and "Segment: " in events[-1].remarks:
                    # Segment: BLL to LGG. ...
                    m = re.search(r"Segment: (.*?) to ", events[-1].remarks)
                    if m:
                        origin = m.group(1).strip()
                
                if not origin:
                    origin = events[-1].location # Fallback
            else:
                origin = None
                dest = None

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
        // Tracking results are in tables with class 'tracking'
        const tables = document.querySelectorAll('table.tracking');
        tables.forEach(table => {
            const rows = table.querySelectorAll('tr');
            if (rows.length < 2) return;
            
            // Header is row 0, data is row 1
            const dataRow = rows[1];
            const cols = dataRow.querySelectorAll('td');
            if (cols.length < 8) return;

            const fromLoc = cols[0].innerText.trim();
            const toLoc = cols[1].innerText.trim();
            const serviceType = cols[2].classList.contains('rfs') ? 'RFS' : (cols[2].classList.contains('flight') ? 'FLIGHT' : '');
            const flightNum = cols[3].innerText.trim();
            const depTime = cols[4].innerText.trim();
            const arrTime = cols[5].innerText.trim();
            const pcs = cols[6].innerText.trim();
            const wgt = cols[7].innerText.trim();

            // Status is represented by icons in the following div.tracking-details
            let status = "In Transit";
            let statusCode = "DEP";
            let nextNode = table.nextElementSibling;
            while (nextNode && !nextNode.classList.contains('tracking-details')) {
                nextNode = nextNode.nextElementSibling;
            }
            if (nextNode && nextNode.classList.contains('tracking-details')) {
                const activeIcon = nextNode.querySelector('li[class*="_on"]');
                if (activeIcon) {
                    if (activeIcon.classList.contains('icon1_on')) { status = "Booked"; statusCode = "BKD"; }
                    else if (activeIcon.classList.contains('icon2_on')) { status = "Received"; statusCode = "RCS"; }
                    else if (activeIcon.classList.contains('icon3_on')) { status = "Departed"; statusCode = "DEP"; }
                    else if (activeIcon.classList.contains('icon4_on')) { status = "Arrived"; statusCode = "ARR"; }
                    else if (activeIcon.classList.contains('icon5_on')) { status = "Delivered"; statusCode = "DLV"; }
                }
            }

            results.push({
                location: toLoc || fromLoc,
                status: status,
                statusCode: statusCode,
                date: arrTime || depTime,
                pieces: pcs,
                weight: wgt,
                remarks: `Segment: ${fromLoc} to ${toLoc}. Service: ${serviceType}. Departure: ${depTime}`,
                flight: flightNum
            });
        });
        // Reverse to have latest event first
        results.reverse();
        return results;
        """
        
        try:
            raw_events = driver.execute_script(extraction_script)
            results = []
            for ev in raw_events:
                results.append(TrackingEvent(
                    location=ev.get("location"),
                    status=ev.get("status"),
                    status_code=ev.get("statusCode"),
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
