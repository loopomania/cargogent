import asyncio
from playwright.async_api import async_playwright
import re

async def run():
    from playwright_stealth.stealth import Stealth

    async with Stealth().use_async(async_playwright()) as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--window-size=1920,1080'
            ]
        )
        
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        
        page = await context.new_page()
        
        url = "https://www.deltacargo.com/Cargo/trackShipment"
        print(f"Navigating to {url}")
        await page.goto(url)
        
        try:
            await page.wait_for_selector("input#awbNumber", timeout=15000)
            
            awb = "38686476"
            await page.fill("input#awbNumber", awb)
            await page.click("button.dc-search-button")
            
            print("Waiting for results...")
            await page.wait_for_timeout(10000) 
        except Exception as e:
            print(f"Error during flow: {e}")
            
        html = await page.content()
        with open("delta_pw_stealth_result.html", "w") as f:
            f.write(html)
            
        print("Saved to delta_pw_stealth_result.html")
            
        await browser.close()

async def main():
    await run()

if __name__ == "__main__":
    asyncio.run(main())
