import asyncio
from playwright.async_api import async_playwright

async def main():
    proxy = "wss://brd-customer-hl_e9a94126-zone-scraping_browser1scraping_brow:41knrxbwz3xy@brd.superproxy.io:9222"
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(proxy)
        context = browser.contexts[0]
        page = await context.new_page()
        
        await page.goto("https://www.cathaycargo.com/en-us/track-and-trace.html", wait_until="domcontentloaded", timeout=60000)
        await asyncio.sleep(5)
        
        try:
            await page.click("button:has-text('Accept all')", timeout=5000)
        except: pass
        try:
            await page.evaluate("""() => {
                const overlay = document.querySelector('.cargo_dialog-mask');
                if (overlay) overlay.style.display = 'none';
                const banner = document.querySelector('.cargo_cookieconsent');
                if (banner) banner.style.display = 'none';
            }""")
        except: pass
        
        await asyncio.sleep(2)
        
        await page.fill("input[name$='_airlineCodeField']", "160", force=True)
        await page.fill("input[name$='_airWaybill']", "83499721", force=True)
        await page.keyboard.press("Enter")
        await asyncio.sleep(2)
        
        await page.click("input[value='Track now']", force=True)
        await asyncio.sleep(15)
        
        await page.screenshot(path="/app/cx_step3.png")
        await browser.close()

asyncio.run(main())
