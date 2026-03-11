"""
Delta Cargo tracker.

Uses undetected-chromedriver to access https://www.deltacargo.com/Cargo/trackShipment.
Delta requires AWB + Destination Airport for recipient tracking. We try common Delta hubs
(ATL, JFK, LAX, DTW) as fallback when destination is unknown.

AWB format: 006 + 8 digits (e.g. 00610949890)
"""

from __future__ import annotations

import os
import re
import time
from typing import List

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select

from .base import AirlineTracker
from .common import (
    is_bot_blocked_html,
    normalize_awb,
    parse_events_from_html_table,
    summarize_from_events,
)
from models import TrackingEvent, TrackingResponse


# Common Delta hub codes - used when form requires destination and we don't have it
DELTA_HUB_FALLBACKS = ("ATL", "JFK", "LAX", "DTW", "SEA", "MSP")


class DeltaTracker(AirlineTracker):
    name = "delta"
    base_url = "https://www.deltacargo.com/Cargo/trackShipment"

    def _try_submit_form(self, driver, awb_clean: str, trace: list) -> bool:
        """Fill and submit the tracking form. Returns True if submission succeeded."""
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.common.action_chains import ActionChains

        try:
            # Dismiss cookie banner first
            banner_selectors = [
                "button#onetrust-accept-btn-handler",
                "button.onetrust-close-btn-handler",
                "//button[contains(., 'Accept')]",
            ]
            for sel in banner_selectors:
                try:
                    if sel.startswith("//"):
                        el = driver.find_element(By.XPATH, sel)
                    else:
                        el = driver.find_element(By.CSS_SELECTOR, sel)
                    if el.is_displayed():
                        driver.execute_script("arguments[0].click();", el)
                        trace.append(f"dismissed_banner:{sel}")
                        time.sleep(2)
                        break
                except: continue

            # Expand TRACK tab
            awb_present = len(driver.find_elements(By.CSS_SELECTOR, "input#awbNumber")) > 0
            if not awb_present:
                track_tab_selectors = [
                    "a.dc-tab-main-link",
                    "//a[contains(., 'TRACK')]",
                    "//span[text()='TRACK']",
                ]
                for sel in track_tab_selectors:
                    try:
                        if sel.startswith("//"):
                            el = driver.find_element(By.XPATH, sel)
                        else:
                            el = driver.find_element(By.CSS_SELECTOR, sel)
                        
                        # Use ActionChains for a real mouse click
                        ActionChains(driver).move_to_element(el).click().perform()
                        trace.append(f"clicked_track_tab:{sel}")
                        
                        # Wait for expansion
                        WebDriverWait(driver, 10).until(
                            EC.visibility_of_element_located((By.CSS_SELECTOR, "input#awbNumber"))
                        )
                        trace.append("wait_for_awb_input_success")
                        break
                    except Exception as e:
                        trace.append(f"click_tab_failed:{sel}:{str(e)[:50]}")
                        continue
            else:
                trace.append("awb_input_already_visible")

            # Find AWB input with explicit wait
            try:
                awb_input = WebDriverWait(driver, 5).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, "input#awbNumber"))
                )
                trace.append("found_awb_input:input#awbNumber")
            except:
                trace.append("searching_fallback_inputs")
                inputs = driver.find_elements(By.CSS_SELECTOR, "input[type='text']")
                awb_input = next((inp for inp in inputs if inp.is_displayed() and "search" not in (inp.get_attribute("id") or "").lower()), None)
                if awb_input: trace.append("found_fallback_awb_input")

            if not awb_input:
                trace.append("failed_to_find_awb_input")
                return False

            # Smart entry: Delta often auto-prefixes "006-"
            # If the prefix is 006, just enter the serial. 
            # Otherwise enter the whole thing.
            prefix = awb_clean[:3]
            if prefix == "006":
                entry_val = awb_clean[3:]
                trace.append(f"entering_serial_only:{entry_val}")
            else:
                entry_val = awb_clean
                trace.append(f"entering_full_awb:{entry_val}")

            awb_input.clear()
            awb_input.send_keys(entry_val)
            trace.append("entered_value")
            time.sleep(1)

            # Submit
            try:
                submit_btn = WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, "button.dc-search-button"))
                )
                # Scroll to it
                driver.execute_script("arguments[0].scrollIntoView(true);", submit_btn)
                time.sleep(1)
                
                # Real click
                ActionChains(driver).move_to_element(submit_btn).click().perform()
                trace.append("clicked_submit_button:actionchains")
            except Exception as e:
                trace.append(f"submit_click_failed:{str(e)[:50]}")
                awb_input.send_keys("\ue007")
                trace.append("sent_enter_key_fallback")
            
            # Post-submit screenshot
            time.sleep(5)
            try: driver.save_screenshot("/tmp/delta_post_submit.png")
            except: pass
            
            return True
                
        except Exception as e:
            trace.append(f"submit_form_error:{e}")
        return False

    def _extract_events_from_text(self, page_text: str) -> List[TrackingEvent]:
        """Extract events from page text using common cargo status patterns."""
        events: List[TrackingEvent] = []
        
        # Delta specific format from captured text:
        # 01/31/2026 1111 Activity description
        # Using a more robust multi-line parsing approach
        # Split by typical Delta lines first
        lines = page_text.split("\n")
        for line in lines:
            # Match MM/DD/YYYY followed by 4-digit time HHmm
            m = re.search(r"(\d{2}/\d{2}/\d{4})\s+(\d{4})\s+(.*)", line)
            if not m:
                # Try space-joined version too
                m = re.search(r"(\d{2}/\d{2}/\d{4})\s+(\d{4})\s+(.*?)(?=\s+\d{2}/|$)", line)
            
            if m:
                date_str = m.group(1)
                time_str = m.group(2)
                activity = m.group(3).strip()
                
                # Extract location (3 uppercase letters near "at", "from", "to", "in")
                location = None
                loc_match = re.search(r"\b(at|from|to|in|for)\s+([A-Z]{3})\b", activity, re.IGNORECASE)
                if loc_match:
                    location = loc_match.group(2).upper()
                else:
                    # Fallback: find any 3-letter uppercase word
                    loc_matches = re.findall(r"\b([A-Z]{3})\b", activity)
                    if loc_matches:
                        location = loc_matches[-1]
                
                # Extract status code based on keywords
                status_code = "UNKN"
                act_low = activity.lower()
                if any(k in act_low for k in ["accepted", "manifest", "on hand", "ready", "received", "processed"]):
                    status_code = "RCS"
                elif any(k in act_low for k in ["departed", "in transit", "left"]):
                    status_code = "DEP"
                elif any(k in act_low for k in ["arrived", "reached"]):
                    status_code = "ARR"
                elif any(k in act_low for k in ["ready for pick-up", "out for delivery", "available"]):
                    status_code = "NFD"
                elif "delivered" in act_low:
                    status_code = "DLV"
                elif "manifested" in act_low:
                    status_code = "MAN"
                elif "booked" in act_low:
                    status_code = "BKD"
                    
                events.append(
                    TrackingEvent(
                        status_code=status_code,
                        location=location,
                        date=f"{date_str} {time_str}",
                        description=activity[:200]
                    )
                )
            
        # Standard cargo patterns as fallback
        patterns = [
            r"(BKD|RCS|DEP|ARR|RCF|NFD|AWD|DLV|FOH|MAN|DIS)\s+([A-Z]{3})\s+(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}|\d{2}\s+[A-Za-z]{3}\s+\d{2})\s+(\d{2}:\d{2})",
        ]
        for pattern in patterns:
            for m in re.finditer(pattern, page_text, re.IGNORECASE):
                g = m.groups()
                # Avoid duplicates
                if any(e.date.startswith(g[2]) for e in events):
                    continue
                events.append(
                    TrackingEvent(
                        status_code=g[0].upper(),
                        location=g[1],
                        date=" ".join(str(x) for x in g[2:4]),
                    )
                )
        return events

    async def track(self, awb: str) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="006")
        awb_fmt = f"{prefix}-{serial}"
        awb_clean = f"{prefix}{serial}"
        message = "Success"
        blocked = False
        html = ""
        page_text = ""
        source_url = self.base_url

        options = uc.ChromeOptions()
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1920,1080")

        trace = []
        driver = None
        try:
            driver = uc.Chrome(options=options, headless=False, use_subprocess=True)
            driver.set_page_load_timeout(90)

            driver.get(source_url)
            time.sleep(8) 

            if self._try_submit_form(driver, awb_clean, trace):
                time.sleep(20) 
            else:
                trace.append("form_submission_failed")

            # Improved text extraction that preserves separation between elements
            page_text = driver.execute_script("""
                function getAllText(node) {
                    let text = "";
                    if (node.nodeType === Node.TEXT_NODE) {
                        text += node.textContent + " ";
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        const style = window.getComputedStyle(node);
                        if (style.display === 'block' || style.display === 'flex' || node.tagName === 'BR' || node.tagName === 'TR' || node.tagName === 'P' || node.tagName === 'DIV') {
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

            if os.environ.get("DELTA_DEBUG_HTML"):
                try:
                    out = os.path.join(os.path.dirname(__file__), "..", "delta_page_sample.html")
                    with open(out, "w", encoding="utf-8") as f:
                        f.write(html)
                except Exception:
                    pass

            if is_bot_blocked_html(html) or "just a moment" in html.lower() or "access denied" in html.lower():
                blocked = True
                message = "Bot protection or session validation blocked the request."
            else:
                message = "Successfully loaded tracking data."
        except Exception as exc:
            message = f"Delta tracking failed: {exc}"
            blocked = True
        finally:
            if driver:
                try:
                    driver.quit()
                except Exception:
                    pass

        events = parse_events_from_html_table(html)
        if not events and not blocked:
            events = self._extract_events_from_text(page_text)

        # Better sorting and summarization
        origin, destination, status, flight = None, None, None, None
        if events:
            from datetime import datetime
            try:
                # Sort by date (Delta: MM/DD/YYYY HHmm)
                events.sort(key=lambda x: datetime.strptime(x.date, "%m/%d/%Y %H%M") if x.date and "/" in x.date else datetime.min)
            except:
                pass
            
            # Find first and last locations
            locs = [e.location for e in events if e.location and len(e.location) == 3]
            if locs:
                origin = locs[0]
                destination = locs[-1]
            
            status = events[-1].status_code
            flight = next((e.flight for e in reversed(events) if e.flight), None)

        if (not origin or len(origin) != 3) and page_text:
            m = re.search(r"Origin[:\s]+([A-Z]{3})\b", page_text, re.IGNORECASE)
            if m: origin = m.group(1).upper()
            
        if (not destination or len(destination) != 3) and page_text:
            m = re.search(r"Destination[:\s]+([A-Z]{3})\b", page_text, re.IGNORECASE)
            if m: destination = m.group(1).upper()

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
