import asyncio
from playwright.async_api import async_playwright

async def main():
    proxy = "wss://brd-customer-hl_e9a94126-zone-scraping_browser1scraping_brow:41knrxbwz3xy@brd.superproxy.io:9222"
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(proxy)
        context = browser.contexts[0]
        page = await context.new_page()
        
        await page.goto("https://www.cathaycargo.com/en-us/track-and-trace.html", wait_until="domcontentloaded")
        await asyncio.sleep(4)
        
        # Dump the HTML
        html = await page.content()
        with open("/app/cx_cookie_dump.html", "w") as f:
            f.write(html)
            
        await browser.close()

asyncio.run(main())
