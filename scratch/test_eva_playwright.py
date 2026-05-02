import asyncio
from playwright.async_api import async_playwright

async def test_brcargo():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        
        await page.goto("https://www.brcargo.com/NEC_WEB/Tracking/QuickTracking/Index", wait_until="domcontentloaded")
        await asyncio.sleep(5)
        
        html = await page.content()
        with open("scratch/eva_debug.html", "w") as f:
            f.write(html)
            
        await browser.close()

asyncio.run(test_brcargo())
