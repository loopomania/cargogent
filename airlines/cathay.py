from __future__ import annotations
import logging
import re
import time
import random
import json
from bs4 import BeautifulSoup
from typing import List, Optional
from datetime import datetime

from .base import AirlineTracker
from .common import normalize_awb
from models import TrackingResponse, TrackingEvent

import asyncio
from playwright.async_api import async_playwright, Page

logger = logging.getLogger(__name__)

# Basic javascript injection payload to hide Playwright/Headless Chromium properties from Akamai
AKAMAI_STEALTH_SCRIPT = """
    // Mask webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    // Mock chrome
    window.chrome = { runtime: {} };
    // Mask WebGL rendering engine
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return 'Google Inc. (Apple)';
        if (parameter === 37446) return 'ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)';
        return getParameter.apply(this, [parameter]);
    };
"""

async def simulate_human_mouse(page: Page, target_selector: str):
    """
    Simulates a non-linear (bezier) mouse movement to the target selector.
    Akamai's sensor relies heavily on `onmousemove` events to build its token.
    """
    element = await page.query_selector(target_selector)
    if not element: return

    box = await element.bounding_box()
    if not box: return

    # Target coordinates with a little randomness inside the element bounds
    target_x = box['x'] + (box['width'] / 2) + random.randint(-5, 5)
    target_y = box['y'] + (box['height'] / 2) + random.randint(-5, 5)

    # Current generic start coordinates
    current_x = random.randint(100, 300)
    current_y = random.randint(100, 300)

    # Move to starting pos instantly
    await page.mouse.move(current_x, current_y)
    
    # Calculate bezier control point for a slight arc
    control_x = current_x + (target_x - current_x) * 0.5 + random.randint(-50, 50)
    control_y = current_y + (target_y - current_y) * 0.5 + random.randint(-50, 50)

    steps = 20
    for i in range(1, steps + 1):
        t = i / steps
        # Quadratic bezier formula
        x = (1 - t)**2 * current_x + 2 * (1 - t) * t * control_x + t**2 * target_x
        y = (1 - t)**2 * current_y + 2 * (1 - t) * t * control_y + t**2 * target_y
        
        await page.mouse.move(x, y)
        await asyncio.sleep(random.uniform(0.01, 0.04))

class CathayTracker(AirlineTracker):
    name = "cathay"

    async def track(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="160")
        awb_formatted = f"{prefix}-{serial}"
        
        try:
            async with async_playwright() as p:
                if not self.proxy:
                    raise Exception("Premium proxy required for Cathay")
                browser = await p.chromium.connect_over_cdp(self.proxy)
                context = browser.contexts[0]
                page = await context.new_page()

                # 1. Inject Application Layer Bypass script before page loads
                await page.add_init_script(AKAMAI_STEALTH_SCRIPT)

                # Navigate directly to the tracking endpoint
                url = f"https://www.cathaycargo.com/en-us/track-and-trace.html"
                
                logger.info(f"[Cathay] Navigating to {url}")
                await page.goto(url, wait_until="domcontentloaded", timeout=60000)

                # Wait for page to settle
                await asyncio.sleep(5)
                
                # Wait for and dismiss cookie banner
                try:
                    await page.wait_for_selector("button:has-text('Accept all')", timeout=15000)
                    await page.click("button:has-text('Accept all')", timeout=5000)
                except Exception as e:
                    logger.debug(f"[Cathay] No cookie banner found or click failed: {e}")
                
                # Fallback JS hide just in case
                try:
                    await page.evaluate("""() => {
                        const overlay = document.querySelector('.cargo_dialog-mask');
                        if (overlay) overlay.style.display = 'none';
                        const banner = document.querySelector('.cargo_cookieconsent');
                        if (banner) banner.style.display = 'none';
                    }""")
                except:
                    pass
                await asyncio.sleep(1)
                
                # Type the AWB into the fields
                await page.fill("input[name$='_airlineCodeField']", prefix)
                await page.fill("input[name$='_airWaybill']", serial)
                await page.keyboard.press("Enter")
                await asyncio.sleep(2)

                track_btn_selector = "input[value='Track now']"
                
                json_data = None
                try:
                    # Expect the JSON API response from the new SPA
                    async with page.expect_response(lambda response: "cargo-shipments/v1/tracking" in response.url and response.request.method != "OPTIONS", timeout=30000) as response_info:
                        await page.click(track_btn_selector)
                        
                    response = await response_info.value
                    if response.status == 200:
                        json_data = await response.json()
                except Exception as e:
                    logger.warning(f"[Cathay] Could not extract API JSON or click track button: {e}")
                
                await browser.close()
                
                if not json_data:
                     return TrackingResponse(
                        awb=awb_formatted,
                        airline="Cathay Cargo",
                        status="Error",
                        events=[],
                        message="Bypass failed or AWB not found (No JSON returned)",
                        raw_meta={"bypass_attempted": True},
                    )

                return self._parse_json(json_data, awb_formatted)
                
        except Exception as e:
            logger.error(f"[Cathay] Error tracking {awb_formatted}: {e}")
            return TrackingResponse(
                awb=awb_formatted,
                airline="Cathay Cargo",
                status="Error",
                events=[],
                message=f"Bypass failed: {str(e)}",
                raw_meta={"error": str(e)},
            )

    def _parse_json(self, data: dict, awb: str) -> TrackingResponse:
        events: List[TrackingEvent] = []
        overall_status = "Pending Ground Data"
        
        # 1. Parse flight bookings from bookingStatus
        for bk in data.get("bookingStatus", []):
            if bk.get("type") == "BKD":
                status_desc = bk.get("status", "Booked")
                station = bk.get("station", "")
                flight = bk.get("flight", "").split("/")[0] if bk.get("flight") else ""
                
                atd = bk.get("ATD")
                etd = bk.get("ETD") or bk.get("STD")
                date_val = atd or etd or bk.get("flightDate")
                
                if date_val:
                    events.append(TrackingEvent(
                        status_code="BKD",
                        status=status_desc,
                        location=station,
                        date=atd or date_val,
                        estimated_date=etd,
                        flight=flight,
                        pieces=str(bk.get("pieces")) if bk.get("pieces") is not None else None,
                        weight=str(bk.get("weight")) if bk.get("weight") is not None else None,
                        raw_meta={"type": "BKD"}
                    ))
        
        # 2. Parse actual historical events from shipHistory
        history = data.get("shipHistory", [])
        for item in history:
            status_desc = item.get("statusMsgDisplay") or item.get("statusMsg", "")
            code = item.get("status", "")
            station = item.get("station", "")
            flight = item.get("flightInfo", "").split("/")[0] if item.get("flightInfo") else ""
            if "ULD:" in flight:
                flight = ""
                
            dt_str = item.get("dateTime")
            if dt_str:
                events.append(TrackingEvent(
                    status_code=code,
                    status=status_desc,
                    location=station,
                    date=dt_str,
                    flight=flight,
                    pieces=str(item.get("pieces")) if item.get("pieces") is not None else None,
                    weight=str(item.get("weight")) if item.get("weight") is not None else None,
                    raw_meta={"code": code}
                ))

        # Sort events chronologically
        if events:
            try:
                events.sort(key=lambda x: x.date if 'T' in x.date else "")
            except:
                pass
            
            latest = data.get("latestStatus", {}).get("status")
            if latest:
                overall_status = latest
            else:
                overall_status = events[-1].status

        return TrackingResponse(
            awb=awb,
            airline="Cathay Cargo",
            status=overall_status,
            events=events,
            raw_meta={"source": "api_scraper", "event_count": len(events)}
        )
