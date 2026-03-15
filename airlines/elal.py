from __future__ import annotations

import asyncio
import json
import re
import os
from typing import List

from playwright.async_api import async_playwright, Response

from .base import AirlineTracker
from .common import normalize_awb, is_bot_blocked_html
from models import TrackingResponse, TrackingEvent


class ElAlTracker(AirlineTracker):
    name = "elal"
    main_url = "https://www.elal.com/en/Cargo/Pages/Online-Tracking.aspx"

    async def track(self, awb: str) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="114")
        awb_fmt = f"{prefix}-{serial}"
        message = "Success"
        blocked = False
        events: List[TrackingEvent] = []
        origin = None
        destination = None
        trace = []

        # CRITICAL: We use headed mode on Xvfb (:99) to bypass Reblaze/Radware
        os.environ["DISPLAY"] = ":99"

        proxy_config = None
        if self.proxy:
            match = re.search(r'https?://(?:([^:@]+):([^@]*)@)?([^:]+):(\d+)', self.proxy)
            if match:
                user, password, host, port = match.groups()
                proxy_config = {
                    "server": f"http://{host}:{port}",
                    "username": user,
                    "password": password,
                }
                trace.append("using_playwright_proxy")

        try:
            async with async_playwright() as p:
                # Launch in HEADED mode
                browser = await p.chromium.launch(
                    headless=False,
                    proxy=proxy_config,
                    args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
                )

                context = await browser.new_context(
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/124.0.0.0 Safari/537.36"
                    ),
                )

                # Manual Stealth
                await context.add_init_script("""
                    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                    window.navigator.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
                    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
                """)
                
                page = await context.new_page()
                trace.append("browser_started_headed_stealth")

                # Interception
                ajax_data: list = []

                async def handle_response(response: Response):
                    if "getStations" in response.url and response.status == 200:
                        try:
                            body = await response.json()
                            if isinstance(body, list):
                                ajax_data.extend(body)
                                trace.append(f"intercepted_ajax:{len(body)}_items")
                        except:
                            pass

                page.on("response", handle_response)

                trace.append("navigating_main_page")
                await page.goto(self.main_url, timeout=60000, wait_until="domcontentloaded")

                # Wait for Reblaze challenge to clear in headed mode
                await asyncio.sleep(15)

                body_html = await page.content()
                if "onetrust-accept-btn-handler" in body_html:
                    try:
                        await page.click("#onetrust-accept-btn-handler", timeout=5000)
                        trace.append("cookies_accepted")
                    except: pass

                if is_bot_blocked_html(body_html) or "access denied" in body_html.lower() or "challenge" in body_html.lower():
                    if "rbzns" in body_html or "winsocks" in body_html:
                        trace.append("reblaze_challenge_detected")
                        await asyncio.sleep(15)
                        body_html = await page.content()

                if is_bot_blocked_html(body_html) or "access denied" in body_html.lower():
                    blocked = True
                    trace.append("main_page_blocked")
                else:
                    trace.append("main_page_loaded")
                    # Form interaction
                    try:
                        # Find prefix/serial (Try multiple selectors, some sites use iframes but diagnostic v4 says it's main page)
                        prefix_input = await page.query_selector("input.txtTrackPrefix, #txtAwbPrefix, input[name*='refix']")
                        if prefix_input:
                            await prefix_input.fill(prefix)
                            trace.append("filled_prefix")
                        
                        serial_input = await page.query_selector("input.txttrackAWBNum, #txtAwbNum, input[name*='erial']")
                        if serial_input:
                            await serial_input.fill(serial)
                            trace.append("filled_serial")

                        if prefix_input and serial_input:
                            btn = await page.query_selector("button.btnOnlineTracking, #btnTrack, button:has-text('GO')")
                            if btn:
                                await btn.click()
                                trace.append("clicked_track_button")
                                await asyncio.sleep(10)
                    except Exception as e:
                        trace.append(f"form_interaction_err:{str(e)[:40]}")

                    # Manual fetch if still no data (headed cookies should be valid)
                    if not ajax_data:
                        trace.append("manual_ajax_fallback")
                        try:
                            result = await page.evaluate(f"""
                                async () => {{
                                    try {{
                                        const r = await fetch(
                                            '/ElalCargo/ajax/getStations?awbTrackNum={serial}&airlineId={prefix}',
                                            {{ headers: {{ 'X-Requested-With': 'XMLHttpRequest' }}, credentials: 'include' }}
                                        );
                                        const text = await r.text();
                                        return {{status: r.status, body: text}};
                                    }} catch(e) {{ return {{error: e.message}}; }}
                                }}
                            """)
                            if result and not result.get("error"):
                                body_text = result.get("body", "").strip()
                                if body_text.startswith("["):
                                    parsed = json.loads(body_text)
                                    ajax_data.extend(parsed)
                                    trace.append(f"manual_ajax_success:{len(parsed)}")
                                else:
                                    trace.append(f"manual_ajax_not_json_len:{len(body_text)}")
                        except:
                            pass

                if ajax_data:
                    events = self._parse_ajax_data(ajax_data)
                    trace.append(f"strategy_1_events:{len(events)}")

                # Legacy fallback
                if not events:
                    trace.append("strategy_2_legacy")
                    legacy_url = f"https://www.elalextra.net/info/awb.asp?aid={prefix}&awb={serial}&Lang=Eng"
                    try:
                        await page.goto(legacy_url, timeout=30000)
                        await asyncio.sleep(5)
                        legacy_text = await page.evaluate("document.body.innerText")
                        if "Access Denied" not in legacy_text and "Edgesuite" not in legacy_text:
                            events = self._parse_legacy_text(legacy_text)
                            if events: trace.append(f"legacy_events:{len(events)}")
                    except:
                        pass

                await browser.close()

        except Exception as exc:
            message = f"El Al tracking failed: {exc}"
            blocked = True
            trace.append(f"exception:{str(exc)[:80]}")

        status, flight = None, None
        if events:
            status = events[-1].status_code
            flight = next((e.flight for e in reversed(events) if e.flight), None)
            if not origin:
                origin = events[0].location
                destination = events[-1].location

        return TrackingResponse(
            airline=self.name, awb=awb_fmt, origin=origin, destination=destination,
            status=status, flight=flight, events=events, message=message, blocked=blocked,
            raw_meta={"trace": trace},
        )

    def _parse_ajax_data(self, data: list) -> List[TrackingEvent]:
        events: List[TrackingEvent] = []
        if not data or not isinstance(data, list): return events
        def s(val): return str(val).strip() if val is not None else None
        for item in data:
            events.append(TrackingEvent(
                status_code=s(item.get("TYPE")),
                location=s(item.get("Origin") or item.get("Dest")),
                date=f"{s(item.get('PointDateStr',''))} {s(item.get('DepTime',''))}".strip(),
                flight=s(item.get("Flight")),
                pieces=s(item.get("PCS")), weight=s(item.get("Weight")),
                remarks=s(item.get("DetailedStatus")),
            ))
        return events

    def _parse_legacy_text(self, text: str) -> List[TrackingEvent]:
        events: List[TrackingEvent] = []
        pattern = r"([A-Z]{3})\s+([A-Z]{3})\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{2})\s+(\d{2}:\d{2})\s+(\d+)\s+([\d.]+)\s*([A-Z]{3})"
        for m in re.finditer(pattern, text):
            g = m.groups()
            events.append(TrackingEvent(
                status_code=g[6], location=g[0], date=f"{g[2]} {g[3]}", pieces=g[4], weight=g[5],
            ))
        return events
