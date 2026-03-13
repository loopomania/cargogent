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

from .base import AirlineTracker
from .common import (
    is_bot_blocked_html,
    normalize_awb,
)
from models import TrackingResponse, TrackingEvent

logger = logging.getLogger(__name__)

class CathayTracker(AirlineTracker):
    name = "cathay"
    base_url = "https://www.cathaycargo.com/en-us/track-and-trace.html"

    async def track(self, awb: str) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="160")
        trace = []
        
        options = uc.ChromeOptions()
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--disable-gpu")
        
        driver = None
        try:
            # Use non-headless mode in virtual framebuffer (DISPLAY=:99)
            driver = uc.Chrome(options=options, headless=False, use_subprocess=True)
            driver.set_page_load_timeout(90)
            trace.append("chrome_started")
            
            driver.get(self.base_url)
            time.sleep(15) # Wait for potential Akamai challenge
            trace.append("page_loaded")
            
            wait = WebDriverWait(driver, 25)
            # Interact with the form
            try:
                # Accept cookies
                try:
                    accept_btn = wait.until(EC.element_to_be_clickable((By.XPATH, "//*[contains(text(), 'Accept all')]")))
                    driver.execute_script("arguments[0].click();", accept_btn)
                    trace.append("cookies_accepted")
                    time.sleep(3)
                except:
                    pass

                from selenium.webdriver.common.action_chains import ActionChains
                actions = ActionChains(driver)

                # Input prefix
                prefix_input = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, 'input[id$="_airlineCodeField"]')))
                actions.move_to_element(prefix_input).click().perform()
                prefix_input.clear()
                for char in prefix:
                    prefix_input.send_keys(char)
                    time.sleep(0.1)
                prefix_input.send_keys(Keys.TAB)
                trace.append("prefix_done")
                
                # Input AWB serial
                awb_input = driver.find_element(By.CSS_SELECTOR, 'input[id$="_airWaybill"]')
                actions.move_to_element(awb_input).click().perform()
                awb_input.clear()
                for char in serial:
                    awb_input.send_keys(char)
                    time.sleep(0.1)
                trace.append("serial_done")
                
                time.sleep(2)
                
                # Explicitly click submit button
                submit_btn = driver.find_element(By.CSS_SELECTOR, ".-searchbar-submit")
                actions.move_to_element(submit_btn).click().perform()
                trace.append("submit_clicked")
                
                time.sleep(10)
            except Exception as e:
                trace.append(f"interaction_failed: {str(e)[:50]}")

            # Wait for any status text
            try:
                wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "div[class*='-overall-status-text'], [class*='timeline']")))
                trace.append("results_rendered")
            except:
                trace.append("results_timeout")
                driver.save_screenshot("cathay_final_error.png")

            # Expand shipment history
            try:
                driver.execute_script("window.scrollTo(0, 500);")
                show_btns = driver.find_elements(By.XPATH, "//*[contains(text(), 'Show all details')]")
                for btn in show_btns:
                    if btn.is_displayed():
                        driver.execute_script("arguments[0].click();", btn)
                trace.append("expand_clicked")
            except:
                pass

            # Scroll to bottom to ensure all scripts run
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(2)

            # Scrape events
            events = self._scrape_events(driver)
            
            # Status and Header
            status = "In Transit"
            origin = None
            dest = None
            
            try:
                status_el = driver.find_element(By.CSS_SELECTOR, ".-overall-status-text")
                status = status_el.text.strip()
            except:
                if events:
                    status = events[0].status

            try:
                od_el = driver.find_element(By.CSS_SELECTOR, ".-overall-od")
                text = od_el.text.strip()
                if " to " in text:
                    origin, dest = text.split(" to ")
            except:
                pass

            return TrackingResponse(
                awb=awb,
                airline="Cathay Cargo",
                origin=origin,
                destination=dest,
                status=status,
                events=events,
                raw_meta={"trace": trace, "events_count": len(events)}
            )

        except Exception as e:
            logger.error(f"Cathay tracking failed: {str(e)}")
            return TrackingResponse(
                awb=awb,
                airline="Cathay Cargo",
                status="Error",
                events=[],
                raw_meta={"error": str(e), "trace": trace}
            )
        finally:
            if driver:
                driver.quit()

    def _scrape_events(self, driver) -> List[TrackingEvent]:
        # Verified text-based scraper
        extraction_script = """
        const events = [];
        const text = document.body.innerText;
        const lines = text.split('\\n').map(l => l.trim()).filter(l => l);
        
        let currentDate = "";
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Date header
            if (line.match(/^\\d{1,2} [A-Z][a-z]{2} \\d{4}$/)) {
                currentDate = line;
                continue;
            }
            // Event row (Time + Loc)
            const timeMatch = line.match(/^(\\d{2}:\\d{2})(\\s+[A-Z]{3})?$/);
            if (timeMatch) {
                const time = timeMatch[1];
                let location = timeMatch[2]?.trim() || "";
                let currentIdx = i;
                if (!location && lines[i+1] && lines[i+1].match(/^[A-Z]{3}$/)) {
                    location = lines[i+1];
                    currentIdx = i + 1;
                }
                const status = lines[currentIdx + 1] || "";
                let remarks = "";
                let j = currentIdx + 2;
                while (j < lines.length && !lines[j].match(/^\\d{2}:\\d{2}/) && !lines[j].match(/^\\d{1,2} [A-Z][a-z]{2} \\d{4}$/)) {
                    remarks += (remarks ? " | " : "") + lines[j];
                    j++;
                }
                events.push({
                    time: (currentDate ? currentDate + " " : "") + time,
                    location: location,
                    status: status,
                    remarks: remarks
                });
                i = j - 1;
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
                    location=ev.get("location"),
                    status=ev.get("status"),
                    remarks=ev.get("remarks")
                ))
            return results
        except Exception as e:
            logger.error(f"Cathay scraping error: {e}")
            return []

    def _scrape_fallback(self, driver) -> List[TrackingEvent]:
        return []
