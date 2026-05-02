import asyncio
import random
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
    element = await page.query_selector(target_selector)
    if not element: return
    box = await element.bounding_box()
    if not box: return
    target_x = box['x'] + (box['width'] / 2) + random.randint(-5, 5)
    target_y = box['y'] + (box['height'] / 2) + random.randint(-5, 5)
    current_x = random.randint(100, 300)
    current_y = random.randint(100, 300)
    await page.mouse.move(current_x, current_y)
    control_x = current_x + (target_x - current_x) * 0.5 + random.randint(-50, 50)
    control_y = current_y + (target_y - current_y) * 0.5 + random.randint(-50, 50)
    steps = 20
    for i in range(1, steps + 1):
        t = i / steps
        x = (1 - t)**2 * current_x + 2 * (1 - t) * t * control_x + t**2 * target_x
        y = (1 - t)**2 * current_y + 2 * (1 - t) * t * control_y + t**2 * target_y
        await page.mouse.move(x, y)
        await asyncio.sleep(random.uniform(0.01, 0.04))

async def main():
    proxy = "wss://brd-customer-hl_e9a94126-zone-scraping_browser1scraping_brow:41knrxbwz3xy@brd.superproxy.io:9222"
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(proxy)
        context = browser.contexts[0]
        page = await context.new_page()
        
        async def handle_response(response):
            if "cx_track.json" in response.url:
                print(f"XHR Response: {response.status} {response.url}")

        page.on("response", handle_response)
        await page.add_init_script(AKAMAI_STEALTH_SCRIPT)

        await page.goto("https://www.cathaycargo.com/en-us/track-and-trace.html", wait_until="domcontentloaded", timeout=60000)
        await asyncio.sleep(3)
        await simulate_human_mouse(page, "body")
        await asyncio.sleep(2)
        
        try:
            await page.click("button:has-text('Accept all')", timeout=2000)
            await asyncio.sleep(1)
        except:
            pass
        try:
            await page.evaluate("""() => {
                const overlay = document.querySelector('.cargo_dialog-mask');
                if (overlay) overlay.style.display = 'none';
                const banner = document.querySelector('.cargo_cookieconsent');
                if (banner) banner.style.display = 'none';
            }""")
        except:
            pass
            
        await page.fill("input[name$='_airlineCodeField']", "160")
        await page.fill("input[name$='_airWaybill']", "83499721")
        await page.keyboard.press("Enter")
        await asyncio.sleep(1)
        
        track_btn_selector = "input[value='Track now']"
        await simulate_human_mouse(page, track_btn_selector)
        await page.screenshot(path="/app/cx_before_click.png")
        await page.click(track_btn_selector, delay=random.randint(50, 150), force=True)
        
        await asyncio.sleep(15)
        
        await browser.close()

asyncio.run(main())
