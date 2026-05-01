import asyncio
import os
import json
from playwright.async_api import async_playwright

async def main():
    proxy = "wss://brd-customer-hl_e9a94126-zone-scraping_browser1scraping_brow:41knrxbwz3xy@brd.superproxy.io:9222"
    awb = "83499931"
    
    print("Connecting to Scraping Browser...")
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(proxy)
        context = browser.contexts[0] if browser.contexts else await browser.new_context()
        page = await context.new_page()

        # Listen for all network responses
        async def log_response(response):
            if "api.cathaypacific.com" in response.url or "tracking" in response.url.lower():
                try:
                    if response.request.resource_type in ["fetch", "xhr"]:
                        text = await response.text()
                        print(f"\n[NETWORK] {response.status} {response.url}")
                        if "{" in text:
                            print(text[:500] + "...")
                except Exception:
                    pass

        page.on("response", log_response)

        print("Navigating to Cathay Tracking...")
        await page.goto("https://www.cathaycargo.com/en-us/manageyourshipment/trackyourshipment.aspx", timeout=90000)
        
        print("Waiting for page load...")
        await page.wait_for_timeout(5000)

        print("Typing AWB...")
        # Try to find the input fields
        try:
            # Cathay uses a single input box or prefix/serial boxes.
            # Assuming it's a single box based on standard Cathay layout.
            await page.fill('input[name="awb"]', awb) # This might be wrong, we will dump the page if it fails.
        except Exception as e:
            print("Failed to find awb input, trying generic inputs...")
            inputs = await page.evaluate("() => Array.from(document.querySelectorAll('input')).map(i => ({id: i.id, name: i.name, type: i.type}))")
            print("Inputs found:", inputs)
            
            # Let's try filling the first text input that looks like AWB
            await page.evaluate(f"""
                const inputs = document.querySelectorAll('input[type="text"]');
                for (let i of inputs) {{
                    if (i.id.includes('awb') || i.name.includes('awb') || i.placeholder.includes('AWB')) {{
                        i.value = '{awb}';
                        break;
                    }}
                }}
            """)

        print("Clicking Track...")
        await page.evaluate("""
            const btns = document.querySelectorAll('button, input[type="submit"], a.btn');
            for (let b of btns) {
                if (b.innerText.toLowerCase().includes('track') || b.value.toLowerCase().includes('track')) {
                    b.click();
                    break;
                }
            }
        """)

        print("Waiting for 15 seconds for API calls to complete...")
        await page.wait_for_timeout(15000)
        
        print("Test complete.")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
