from __future__ import annotations
import logging
import asyncio
from typing import List, Optional
import re

from .base import AirlineTracker
from .common import normalize_awb
from models import TrackingResponse, TrackingEvent

logger = logging.getLogger(__name__)

class ChallengeTracker(AirlineTracker):
    name = "challenge"
    base_url = "https://www.challenge-group.com/tracking/"

    async def track(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        prefix, serial = normalize_awb(awb, default_prefix="700")
        trace = []

        async def _run(page):
            # Load page
            trace.append("page_loaded")
            await page.goto(self.base_url, wait_until="domcontentloaded", timeout=60000)
            await asyncio.sleep(2)
            
            # Input AWB
            await page.fill("#Pre1", prefix, force=True)
            await page.fill("#AWB1", serial, force=True)
            trace.append("awb_input_done")
            
            # Click Submit
            await page.click(".submit_tracking", force=True)
            trace.append("submit_clicked")
            
            # Wait for results or error
            try:
                # wait for either table.tracking or error message
                await page.wait_for_function("""() => {
                    return document.querySelector('table.tracking') || 
                           document.body.innerText.includes('No results were found');
                }""", timeout=20000)
            except Exception as e:
                trace.append(f"interaction_failed: {str(e)[:50]}")
            
            html = await page.content()
            
            # Check for error message
            if "Error: No results were found" in html or "No results were found" in html:
                trace.append("not_found")
                return TrackingResponse(
                    awb=awb,
                    airline="Challenge Group",
                    status="Not Found",
                    events=[],
                    message="No results were found",
                    raw_meta={"trace": trace}
                )

            # Scrape events via JS
            extraction_script = """
            () => {
                const results = [];
                const tables = document.querySelectorAll('table.tracking');
                tables.forEach(table => {
                    const rows = table.querySelectorAll('tr');
                    if (rows.length < 2) return;
                    
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

                    let status = "Booked";
                    let statusCode = "BKD";
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

                    // Check for .atd to determine if the segment has actually departed or arrived
                    const isAtd = cols[4].querySelector('.atd') !== null;
                    const isAta = cols[5].querySelector('.atd') !== null;

                    let segDepStatus = statusCode === "DEP" || statusCode === "ARR" || statusCode === "DLV" ? "DEP" : "BKD";
                    if (isAtd) {
                        segDepStatus = "DEP"; // Has an ATD, so it has definitely departed
                    } else if (statusCode === "BKD" || statusCode === "RCS") {
                        segDepStatus = "BKD";
                    }

                    let segArrStatus = statusCode === "ARR" || statusCode === "DLV" ? "ARR" : "BKD";
                    if (isAta) {
                        segArrStatus = "ARR"; // Has an ATA, so it has definitely arrived
                    } else if (segDepStatus === "DEP") {
                        segArrStatus = "In Transit"; // Departed but arrival unknown
                    } else if (arrTime) {
                        segArrStatus = "RCF"; // Future arrival (scheduled)
                    }

                    if (depTime) {
                        results.push({
                            location: fromLoc,
                            status: segDepStatus === "DEP" ? "Departed" : "Booked",
                            statusCode: segDepStatus,
                            date: depTime,
                            pieces: pcs,
                            weight: wgt,
                            remarks: `Segment: ${fromLoc} to ${toLoc}. Service: ${serviceType}.`,
                            flight: flightNum
                        });
                    }

                    if (arrTime || depTime) {
                        results.push({
                            location: toLoc || fromLoc,
                            status: segArrStatus === "ARR" ? "Arrived" : "Scheduled",
                            statusCode: segArrStatus === "ARR" ? "ARR" : (segArrStatus === "RCF" ? "RCF" : "BKD"),
                            date: arrTime || depTime,
                            pieces: pcs,
                            weight: wgt,
                            remarks: `Segment: ${fromLoc} to ${toLoc}. Service: ${serviceType}. Departure: ${depTime}`,
                            flight: flightNum
                        });
                    }
                });
                results.reverse();
                return results;
            }
            """
            
            raw_events = await page.evaluate(extraction_script)
            events = []
            for ev in raw_events:
                events.append(TrackingEvent(
                    location=ev.get("location"),
                    status=ev.get("status"),
                    status_code=ev.get("statusCode"),
                    date=ev.get("date"),
                    pieces=ev.get("pieces"),
                    weight=ev.get("weight"),
                    remarks=ev.get("remarks"),
                    flight=ev.get("flight")
                ))

            status = "In Transit"
            if events:
                status = events[0].status
            
            origin = None
            dest = None
            if events:
                dest = events[0].location
                if events[-1].remarks and "Segment: " in events[-1].remarks:
                    m = re.search(r"Segment: (.*?) to ", events[-1].remarks)
                    if m:
                        origin = m.group(1).strip()
                if not origin:
                    origin = events[-1].location

            return TrackingResponse(
                awb=awb,
                airline="Challenge Group",
                origin=origin,
                destination=dest,
                status=status,
                events=events,
                raw_meta={"trace": trace, "events_count": len(events)}
            )

        try:
            from playwright.async_api import async_playwright
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()
                res = await _run(page)
                await browser.close()
                return res
        except Exception as e:
            logger.error(f"Challenge tracking failed: {str(e)}")
            return TrackingResponse(
                awb=awb,
                airline="Challenge Group",
                status="Error",
                events=[],
                raw_meta={"error": str(e), "trace": trace}
            )
