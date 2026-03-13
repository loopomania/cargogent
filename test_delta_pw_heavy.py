import asyncio
from playwright.async_api import async_playwright
import time
import re

async def run():
    from playwright_stealth.stealth import Stealth

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process,SitePerProcess',
                '--flag-switches-begin', '--flag-switches-end',
                '--disable-web-security',
                '--disable-site-isolation-trials',
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        )
        
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        
        # Apply stealth directly to the page instead of context wrapped manager
        page = await context.new_page()
        
        url = "https://www.deltacargo.com/Cargo/trackShipment"
        print(f"Navigating to {url}")
        
        # Add stealth init scripts manually since the context wrapper threw ClosedError
        stealth = Stealth()
        await page.add_init_script(stealth.script_payload)
        
        await page.goto(url)
        
        try:
            await page.wait_for_selector("input#awbNumber", timeout=15000)
            
            awb = "38686476"
            await page.fill("input#awbNumber", awb)
            await page.click("button.dc-search-button")
            
            print("Waiting for results...")
            await page.wait_for_timeout(10000) 
            
            html = await page.content()
            with open("delta_pw_heavy_result.html", "w") as f:
                f.write(html)
                
            print("Saved to delta_pw_heavy_result.html")
        except Exception as e:
            print(f"Error during flow: {e}")
            html = await page.content()
            with open("delta_pw_heavy_result.html", "w") as f:
                f.write(html)
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
