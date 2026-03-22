import asyncio
import os
import sys

os.chdir(os.path.join(os.getcwd(), 'AWBTrackers'))
sys.path.append(os.getcwd())

from playwright.async_api import async_playwright
from router import PROXY_URL
import re

async def debug_ajax(awb):
    prefix = awb[:3]
    serial = awb[3:]
    proxy_config = None
    if PROXY_URL:
        match = re.search(r'https?://(?:([^:@]+):([^@]*)@)?([^:]+):(\d+)', PROXY_URL)
        if match:
            user, password, host, port = match.groups()
            proxy_config = {
                "server": f"http://{host}:{port}",
                "username": user,
                "password": password,
            }

    print(f"Proxy: {proxy_config}")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, proxy=proxy_config)
        context = await browser.new_context()
        page = await context.new_page()
        
        # Go to El Al home page first to get cookies/Link11 clearance
        print("Navigating to home...")
        await page.goto("https://www.elal.com/en/Cargo/Pages/Online-Tracking.aspx", wait_until="domcontentloaded")
        await asyncio.sleep(2)
        
        url = f"https://www.elal.com/en/Cargo/Pages/AIR2.aspx/getStations?awbTrackNum={serial}&airlineId={prefix}"
        print(f"Fetching AJAX: {url}")
        
        # We need to do a fetch inside the page context because AIR2.aspx expects POST with json empty body or similar? 
        # Wait, the code in elal.py does: await fetch('AIR2.aspx/getStations...') which is relative to the iframe.
        # Let's see what AIR2 URL actually is:
        result = await page.evaluate(f'''async () => {{
            try {{
                const r = await fetch('https://www.elal.com/en/Cargo/Pages/AIR2.aspx/getStations?awbTrackNum={serial}&airlineId={prefix}');
                return await r.text();
            }} catch(e) {{ return e.toString(); }}
        }}''')
        
        print(f"Result: {result}")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(debug_ajax('11463888580'))
