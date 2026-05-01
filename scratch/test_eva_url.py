import asyncio
from playwright.async_api import async_playwright
import json

AKAMAI_STEALTH_SCRIPT = """
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
"""

async def test_brcargo():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        await page.add_init_script(AKAMAI_STEALTH_SCRIPT)
        
        print("Navigating to BRCargo with params...")
        await page.goto("https://www.brcargo.com/NEC_WEB/Tracking/QuickTracking/Index?prefix=695&awb=59552286", wait_until="domcontentloaded")
        
        await asyncio.sleep(5)
        html = await page.content()
        print("HTML length:", len(html))
        if "59552286" in html:
            print("Found AWB in HTML!")
        
        await browser.close()

asyncio.run(test_brcargo())
