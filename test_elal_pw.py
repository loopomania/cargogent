
import asyncio
from playwright.async_api import async_playwright
import os

async def test_elal_pw(awb_clean, proxy_url):
    prefix = awb_clean[:3]
    serial = awb_clean[3:]
    
    print(f"Tracking {prefix}-{serial} with Playwright and proxy...")
    
    # Parse proxy
    import re
    match = re.search(r'http://(?:(.*):(.*)@)?(.*):(\d+)', proxy_url)
    user, password, host, port = match.groups()
    
    proxy_config = {
        "server": f"http://{host}:{port}",
        "username": user,
        "password": password
    }
    
    async with async_playwright() as p:
        # Use a real browser channel if possible, or just standard chromium
        browser = await p.chromium.launch(
            headless=False, # We use Xvfb on server
            proxy=proxy_config
        )
        
        # Create context with realistic User Agent
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 1024}
        )
        
        page = await context.new_page()
        
        # Navigate to main page first
        print("Navigating to main page...")
        try:
            await page.goto("https://www.elal.com/en/Cargo/Pages/Online-Tracking.aspx", timeout=60000, wait_until="networkidle")
            print("Main page loaded.")
            
            # Use the AJAX endpoint directly via evaluation
            print("Calling AJAX...")
            ajax_script = f"""
                async () => {{
                    const r = await fetch('/ElalCargo/ajax/getStations?awbTrackNum={serial}&airlineId={prefix}', {{
                        method: 'POST',
                        headers: {{ 'X-Requested-With': 'XMLHttpRequest' }}
                    }});
                    return await r.json();
                }}
            """
            
            # Wait a bit before calling AJAX to look like a human
            await asyncio.sleep(5)
            
            data = await page.evaluate(ajax_script)
            print(f"AJAX result: {len(data)} events")
            import json
            print(json.dumps(data, indent=2))
            
        except Exception as e:
            print(f"Error: {e}")
            # Take screenshot for debug if possible
            # await page.screenshot(path="elal_error.png")
            
        await browser.close()

if __name__ == "__main__":
    import sys
    awb = sys.argv[1] if len(sys.argv) > 1 else "01437623036"
    proxy = ""
    try:
        with open(".env", "r") as f:
            for line in f:
                if line.startswith("PROXY_URL="):
                    proxy = line.split("=", 1)[1].strip().strip('"').strip("'")
    except: pass
    
    asyncio.run(test_elal_pw(awb, proxy))
