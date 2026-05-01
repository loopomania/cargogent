import asyncio
import random
import json
from playwright.async_api import async_playwright

AKAMAI_STEALTH_SCRIPT = """
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return 'Google Inc. (Apple)';
        if (parameter === 37446) return 'ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)';
        return getParameter.apply(this, [parameter]);
    };
"""

async def simulate_human_mouse(page, target_selector):
    try:
        element = await page.query_selector(target_selector)
        if not element: return
        box = await element.bounding_box()
        if not box: return
        target_x = box['x'] + (box['width'] / 2)
        target_y = box['y'] + (box['height'] / 2)
        current_x = random.randint(100, 300)
        current_y = random.randint(100, 300)
        await page.mouse.move(current_x, current_y)
        await page.mouse.move(target_x, target_y, steps=10)
    except: pass

async def main():
    proxy = "wss://brd-customer-hl_e9a94126-zone-scraping_browser1scraping_brow:41knrxbwz3xy@brd.superproxy.io:9222"
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(proxy)
        context = browser.contexts[0]
        page = await context.new_page()
        
        async def handle_response(response):
            if "api.cathaypacific.com/cargo-shipments/v1/milestones" in response.url:
                print(f"MILESTONES API: {response.status}")
                try:
                    text = await response.text()
                    print(json.dumps(json.loads(text), indent=2))
                except Exception as e:
                    print("Error reading API:", e)

        page.on("response", handle_response)
        await page.add_init_script(AKAMAI_STEALTH_SCRIPT)

        await page.goto("https://www.cathaycargo.com/en-us/track-and-trace.html", wait_until="domcontentloaded", timeout=60000)
        await asyncio.sleep(5)
        
        # Click the actual accept button!
        try:
            await page.click("button:has-text('Accept all')", timeout=5000)
        except: pass
            
        await asyncio.sleep(2)
        
        await page.fill("input[name$='_airlineCodeField']", "160")
        await page.fill("input[name$='_airWaybill']", "83499721")
        await page.keyboard.press("Enter")
        await asyncio.sleep(2)
        
        await page.click("input[value='Track now']", force=True)
        
        await asyncio.sleep(15)
        await browser.close()

asyncio.run(main())
