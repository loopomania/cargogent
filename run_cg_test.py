import asyncio
from playwright.async_api import async_playwright
import json

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto("https://www.challenge-group.com/tracking/")
        
        await page.fill("#Pre1", "700")
        await page.fill("#AWB1", "51239311")
        await page.click(".submit_tracking")
        
        await asyncio.sleep(5)
        html = await page.content()
        with open("cg_dump.html", "w") as f:
            f.write(html)
        await browser.close()
        print("Success")

asyncio.run(main())
