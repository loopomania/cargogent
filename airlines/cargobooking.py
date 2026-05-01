from __future__ import annotations

import re
import time
from typing import List

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from .base import AirlineTracker
from .common import normalize_awb, get_uc_chrome_path
from .proxy_util import get_rotating_proxy, get_proxy_extension
from models import TrackingEvent, TrackingResponse


class CargoBookingTracker(AirlineTracker):
    name = "cargobooking"

    async def track(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        """Offload sync UC/Selenium work to the shared browser executor."""
        return await self.run_sync(self._track_sync, awb, hawb=hawb, **kwargs)

    def _track_sync(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="281")
        awb_fmt = f"{prefix}-{serial}"
        awb_no = f"{prefix}{serial}"  # full 11-digit, no dash

        events: List[TrackingEvent] = []
        message = "Success"
        blocked = False
        status = None
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
                options.add_argument(f"--proxy-server={rotated_proxy}")

        url = f"https://cargobooking.aero/track-and-trace?awb={awb_no}"
        driver = None
        text = ""

        try:
            chrome_path = get_uc_chrome_path()
            driver = uc.Chrome(options=options, browser_executable_path=chrome_path, headless=False, use_subprocess=True, version_main=133)
            driver.set_page_load_timeout(60)
            trace.append("chrome_started")

            driver.get(url)
            trace.append(f"navigated_to:{url}")
            time.sleep(5)

            # Dismiss CookieBot banner using its specific button ID
            try:
                driver.execute_script("""
                    const btn = document.getElementById('CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll')
                        || Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.toUpperCase().includes('ALLOW ALL'));
                    if (btn) btn.click();
                """)
                trace.append("cookie_banner_dismissed")
                time.sleep(1)
            except Exception:
                pass

            # 2. Click "SEARCH" button — triggers the specific airline finder for this AWB
            try:
                driver.execute_script("""
                    const container = document.querySelector('app-track-and-trace') || document.body;
                    const searchBtn = Array.from(container.querySelectorAll('button, a, span'))
                        .find(b => b.innerText && b.innerText.toUpperCase() === 'SEARCH');
                    if (searchBtn) searchBtn.click();
                """)
                trace.append("search_button_clicked")
                time.sleep(6) # Optimized from 8s
            except Exception:
                trace.append("search_button_not_found")

            # 3. Click "TRACK DIRECTLY" button (for the found airline)
            try:
                driver.execute_script("""
                    const container = document.querySelector('app-track-and-trace') || document.body;
                    const trackBtn = Array.from(container.querySelectorAll('button, a, span'))
                        .find(b => b.innerText && b.innerText.toUpperCase().includes('TRACK DIRECTLY'));
                    if (trackBtn) trackBtn.click();
                """)
                trace.append("track_directly_clicked")
                time.sleep(6) # Optimized from 8s
            except Exception:
                trace.append("track_directly_not_found")

            # 4. Click "TRACK & TRACE" button (the third specific step)
            try:
                driver.execute_script("""
                    const container = document.querySelector('app-track-and-trace') || document.body;
                    const ttBtn = Array.from(container.querySelectorAll('button, a, span'))
                        .find(b => b.innerText && b.innerText.toUpperCase().includes('TRACK & TRACE') 
                        && !b.closest('header') && !b.closest('footer') && !b.closest('.main-nav'));
                    if (ttBtn) ttBtn.click();
                """)
                trace.append("track_and_trace_clicked")
                time.sleep(12) # Optimized from 15s
            except Exception:
                trace.append("track_and_trace_not_found")

            # Scroll down to ensure content is rendered
            driver.execute_script("window.scrollTo(0, 800);")
            time.sleep(2)

            # 5. Click Show Details to expand full event history
            try:
                driver.execute_script("""
                    const container = document.querySelector('app-track-and-trace') || document.body;
                    const showBtn = Array.from(container.querySelectorAll('button, a, span'))
                        .find(b => b.innerText && b.innerText.toUpperCase().includes('SHOW DETAILS'));
                    if (showBtn) showBtn.click();
                """)
                trace.append("show_details_clicked")
                time.sleep(4) # Optimized from 8s
            except Exception:
                pass


            # Final wait loop for results to populate the DOM text
            for _i in range(8):
                text = driver.execute_script("return document.body.innerText") or ""
                # Searching for actual tracking data markers like Booked, Arrived, or digits
                if len(text) > 1200 or "Booked" in text or "Arrived" in text:
                    break
                time.sleep(3)
            
            trace.append(f"final_text_len:{len(text)}")

        except Exception as exc:
            message = f"cargobooking scraping error: {exc}"
            blocked = True
            trace.append(f"exception:{str(exc)[:80]}")
        finally:
            if driver:
                try:
                    driver.quit()
                except Exception:
                    pass

        if not blocked and text:
            if "Error: No results were found" in text or "not found" in text.lower():
                message = "AWB not found in CargoBooking system."
            elif "Error" in text and len(text) < 100:
                message = "CargoBooking returned an error."
            else:
                events = self._parse_text_to_events(text)
                if events:
                    message = "Success"
                else:
                    message = "No tracking events could be parsed from the page."

        if events:
            # Deduplicate
            seen = set()
            unique = []
            for e in events:
                key = (e.status_code, e.date, e.flight, e.location)
                if key not in seen:
                    seen.add(key)
                    unique.append(e)
            events = unique
            status = events[-1].status_code

        return TrackingResponse(
            airline=self.name,
            awb=awb_fmt,
            status=status,
            events=events,
            message=message,
            blocked=blocked,
            raw_meta={"trace": trace}
        )

    def _parse_text_to_events(self, text: str) -> List[TrackingEvent]:
        """Parse the innerText dump from the CargoBooking tracking page."""
        events: List[TrackingEvent] = []

        # Pattern: 21 Feb 2026 02:36 RO156 booked Ben Gurion International
        pattern = r"(\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+(?:\d{2}:\d{2})?)\s*(?:([A-Z0-9]{2,6})\s+)?(booked|freight prepared|manifested|departed|received from flight|consignee notified|delivered)(\s+[A-Za-z\s,\-]+)?"
        for match in re.finditer(pattern, text, re.IGNORECASE):
            date_str = match.group(1).strip()
            flight = match.group(2).strip() if match.group(2) else None
            status_raw = match.group(3).strip().lower()
            location_raw = match.group(4).strip() if match.group(4) else None

            location = None
            if location_raw:
                clean_loc = location_raw.split('\n')[0].strip()
                location_parts = clean_loc.split(',')
                if location_parts and len(location_parts[0]) < 40 and not location_parts[0].lower().startswith(status_raw[:2]):
                    location = location_parts[0].strip()

            status_map = {
                "booked": "BKD",
                "freight prepared": "RCS",
                "manifested": "MAN",
                "departed": "DEP",
                "received from flight": "RCF",
                "consignee notified": "NFD",
                "delivered": "DLV",
            }
            status_code = status_map.get(status_raw, "UNKN")

            events.append(TrackingEvent(
                status_code=status_code,
                date=date_str,
                flight=flight,
                location=location,
                remarks=status_raw.title(),
            ))

        return events
