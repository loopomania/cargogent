import asyncio
from playwright.async_api import async_playwright
import time

async def main():
    awb_full = "114-64169324"
    prefix = "114"
    serial = "64169324"
    
    # We will go directly to CargoEnter as discovered in the browser subagent logs
    track_url = f"https://cargoenter.com/tracking/el-al?awb={awb_full}"
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"]
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080}
        )
        page = await context.new_page()
        
        print(f"Opening Track URL: {track_url}")
        
        # Cargoenter loads fast
        await page.goto(track_url, wait_until="networkidle", timeout=30000)
        
        html = await page.content()
        
        if "DLV" in html or "ARR" in html or "RCF" in html or "Frankfurt" in html:
            print("SUCCESS! Found tracking data on cargoenter.")
            with open("success_out.html", "w") as f:
                f.write(html)
        else:
            print("FAILED to find tracking details. Page might require clicking or waiting.")
            
            # Wait for any dynamic tracking data to load
            await asyncio.sleep(8)
            html = await page.content()
            
            if "DLV" in html or "ARR" in html or "Frankfurt" in html:
                print("SUCCESS! Found tracking data after waiting.")
                with open("success_out.html", "w") as f:
                    f.write(html)
            else:
                print("FAILED, saving output for review.")
                with open("test_out.html", "w") as f:
                    f.write(html)
                    
        await browser.close()

asyncio.run(main())
