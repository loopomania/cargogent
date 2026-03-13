from __future__ import annotations

import re
import time
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
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
    main_url = "https://www.elal.com/en/Cargo/Pages/Online-Tracking.aspx"
    legacy_url = "https://www.elalextra.net/info/awb.asp?aid=114&awb={serial}&Lang=Eng"

    async def track(self, awb: str) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="114")
        awb_fmt = f"{prefix}-{serial}"
        message = "Success"
        blocked = False
        trace = []
        
        options = uc.ChromeOptions()
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--disable-gpu")
        
        driver = None
        data = None
        events = []
        try:
            driver = uc.Chrome(options=options, headless=False, use_subprocess=True)
            driver.set_page_load_timeout(90)
            trace.append("chrome_started")
            
            # --- STRATEGY 1: AWB Status Box (AJAX) ---
            trace.append("attempting_strategy_1_ajax")
            driver.get(self.main_url)
            time.sleep(15) # Wait for Reblaze
            
            html = driver.page_source
            if is_bot_blocked_html(html):
                trace.append("strategy_1_blocked")
            else:
                ajax_script = f"""
                var callback = arguments[arguments.length - 1];
                fetch('/ElalCargo/ajax/getStations?awbTrackNum={serial}&airlineId=114', {{
                    method: 'POST',
                    headers: {{ 'X-Requested-With': 'XMLHttpRequest' }}
                }})
                .then(r => r.json())
                .then(data => callback(data))
                .catch(err => callback(null));
                """
                try:
                    data = driver.execute_async_script(ajax_script)
                    if data:
                        events = self._parse_ajax_data(data)
                        trace.append(f"strategy_1_success_events:{len(events)}")
                    else:
                        trace.append("strategy_1_no_data")
                except Exception as e:
                    trace.append(f"strategy_1_ajax_error:{str(e)[:50]}")

            # --- STRATEGY 2: Online Tracking Box (Legacy Fallback) ---
            if not events and not blocked:
                trace.append("attempting_strategy_2_legacy")
                # Navigate to legacy URL
                target_legacy = self.legacy_url.format(serial=serial)
                driver.get(target_legacy)
                time.sleep(10)
                
                legacy_text = driver.execute_script("""
                    function getAllText(node) {
                        let text = " ";
                        if (node.nodeType === Node.TEXT_NODE) text += node.textContent + " ";
                        if (node.shadowRoot) text += getAllText(node.shadowRoot);
                        if (node.childNodes) {
                            for (let child of node.childNodes) text += getAllText(child);
                        }
                        return text;
                    }
                    return getAllText(document.body);
                """)
                
                events = self._parse_legacy_text(legacy_text)
                if events:
                    trace.append(f"strategy_2_success_events:{len(events)}")
                    data = {"legacy": True, "text_len": len(legacy_text)}
                else:
                    trace.append("strategy_2_no_data")
                    if is_bot_blocked_html(driver.page_source):
                        blocked = True
                        message = "Access denied by El Al security (Reblaze/Legacy)."

        except Exception as exc:
            message = f"El Al tracking failed: {exc}"
            blocked = True
            trace.append(f"exception:{str(exc)[:80]}")
        finally:
            if driver:
                try:
                    driver.quit()
                except:
                    pass

        origin, destination, status, flight = summarize_from_events(events)
        
        # Header enrichment from AJAX data if available
        if data and not isinstance(data, dict): # if it's the list from AJAX
            if isinstance(data, list) and len(data) > 0:
                first = data[0]
                if not origin: origin = first.get("Origin") or first.get("AWB_ORIGIN")
                if not destination: destination = first.get("Dest") or first.get("AWB_DEST")
                if not flight: flight = first.get("Flight")

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
                "source_url": self.main_url,
                "trace": trace
            },
        )

    def _parse_ajax_data(self, data: list) -> list[TrackingEvent]:
        events = []
        if not data or not isinstance(data, list):
            return events
            
        def safe_str(val):
            return str(val) if val is not None else None

        for item in data:
            events.append(
                TrackingEvent(
                    status_code=safe_str(item.get("TYPE")),
                    location=safe_str(item.get("Origin") or item.get("Dest")),
                    date=safe_str(item.get("ArrTime") or item.get("DepTime")),
                    pieces=safe_str(item.get("PCS")),
                    weight=safe_str(item.get("Weight")),
                    remarks=safe_str(item.get("DetailedStatus")),
                    flight=safe_str(item.get("Flight"))
                )
            )
        return events

    def _parse_legacy_text(self, text: str) -> list[TrackingEvent]:
        events = []
        # Pattern for legacy: FOH TLV 05 Jan 26 22:04 1 4.0 ...
        pattern = r"([A-Z]{3})\s+([A-Z]{3})\s+(\d{2}\s+[A-Z][a-z]{2}\s+\d{2})\s+(\d{2}:\d{2})\s+(\d+)\s+([\d.]+)\s*(.*?)(?=\s+[A-Z]{3}\s+[A-Z]{3}\s+\d{2}|$|MSG)"
        matches = re.finditer(pattern, text)
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
        return events


