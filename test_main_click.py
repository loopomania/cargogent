import asyncio
from playwright.async_api import async_playwright

async def run(awb):
    prefix = awb[:3]
    serial = awb[3:]
    url = "https://www.elal.com/en/Cargo/Pages/Online-Tracking.aspx"

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled"]
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080}
        )
        
        page = await context.new_page()
        print(f"[*] Fetching tracking page {url}...")
        try:
            # Drop the wait_until entirely to fix 45s timeouts on networkidle/domcontentloaded
            await page.goto(url, timeout=60000)
            
            # The form is actually inside an iframe:
            await page.wait_for_selector('iframe[src*="AIR2.aspx"]', timeout=30000)
            iframe_el = page.locator('iframe[src*="AIR2.aspx"]')
                
            frame = await iframe_el.element_handle()
            frame = await frame.content_frame()
            
            await frame.fill("#AWBID", prefix)
            await frame.fill("#AWBNumber", serial)
            
            print("[*] Clicking track button inside iframe...")
            # Setup popup listener
            async with context.expect_page(timeout=15000) as popup_info:
                await frame.click("#ImageButton1")
                
            popup = await popup_info.value
            await popup.wait_for_load_state("networkidle", timeout=30000)
            
            # Now we often get the "outdated page" error on the popup
            html = await popup.content()
            if "access an outdated page" in html.lower():
                print("[*] Detected 'outdated page' error on first click. Retrying on the popup form...")
                # The popup has its own form for tracking
                try:
                    await popup.fill("#AWBID", prefix)
                    await popup.fill("#AWBNumber", serial)
                    await popup.click("#ImageButton1")
                    await popup.wait_for_timeout(8000)
                    html = await popup.content()
                except Exception as e:
                    print(f"Failed to retry within popup: {e}")
            else:
                print("[+] Loaded directly on first click.")
                
            print("Extracted HTML Snippet:")
            print(html[:500])
                
            await browser.close()
            
        except Exception as e:
            print(f"Error: {e}")
            await browser.close()
            return
            
if __name__ == "__main__":
    asyncio.run(run("11463792326"))
