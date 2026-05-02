import asyncio
from playwright.async_api import async_playwright
import time
import random

async def test():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        print("Navigating to /en/main")
        await page.goto("https://www.thaicargo.com/en/main", timeout=60000)
        await asyncio.sleep(2)
        
        print("Filling form")
        await page.fill("input[name='awb_no']", "07891354")
        
        print("Clicking submit")
        # Find the form with PID=WEB01-10 or just the button
        # There are mobile and desktop menus, so we'll just press Enter on the input
        await page.keyboard.press("Enter")
        
        await asyncio.sleep(8)
        
        frames = page.frames
        print("Frames:", len(frames))
        
        content_found = False
        page_text = ""
        for frame in frames:
            try:
                text = await frame.evaluate("() => document.body.innerText") or ""
                if any(kw in text for kw in ["Booked", "Departed", "Arrived", "RCS", "DEP"]):
                    page_text = text
                    content_found = True
                    print("Found content in frame!")
                    break
            except Exception as e:
                pass
                
        if not content_found:
            page_text = await page.evaluate("() => document.body.innerText") or ""
            
        print("Page text length:", len(page_text))
        print("Text snippet:", page_text[:200])
        
        await browser.close()

asyncio.run(test())
