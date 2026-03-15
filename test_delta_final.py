import asyncio
import os
import re
from playwright.async_api import async_playwright

async def main():
    proxy = os.environ.get('PROXY_URL')
    proxy_config = None
    if proxy:
        m = re.search(r'https?://(?:([^:@]+):([^@]*)@)?([^:]+):(\d+)', proxy)
        if m:
            user, password, host, port = m.groups()
            proxy_config = {
                "server": f"http://{host}:{port}",
                "username": user,
                "password": password,
            }

    os.environ['DISPLAY'] = ':99'
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=False, proxy=proxy_config)
        c = await b.new_context()
        p_obj = await c.new_page()
        print("[*] Navigating to Delta...")
        await p_obj.goto('https://www.deltacargo.com/Cargo/trackShipment?awbNumber=00612345678', wait_until='domcontentloaded')
        await asyncio.sleep(25)
        print(f"HTML_LEN:{len(await p_obj.content())}")
        await b.close()

asyncio.run(main())
