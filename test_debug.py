import asyncio
from playwright.async_api import async_playwright
import re

async def main():
    prefix = "114"
    serial = "64169324"
    base_url = "https://www.elalextra.net/EWB/AIR2.aspx"

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"]
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080}
        )
        page = await context.new_page()

        print("[1] Loading base form page...")
        await page.goto(base_url, wait_until="domcontentloaded", timeout=45000)

        for _ in range(5):
            html = await page.content()
            if "kramericaindustries" not in html.lower() and "rbzns" not in html.lower():
                break
            print("   [Radware challenge active, waiting...]")
            await asyncio.sleep(3)

        html = await page.content()
        print(f"[1] Base page loaded. 'outdated page' present: {'access an outdated page' in html.lower()}")
        print(f"[1] 'AWBID' input present: {'id=\"AWBID\"' in html}")
        print(f"[1] 'AWBNumber' input present: {'id=\"AWBNumber\"' in html}")

        if "access an outdated page" in html.lower():
            print("[!] Base page ALSO returned outdated-page error. Can't submit form.")
            with open("base_error.html", "w") as f:
                f.write(html)
            print("  Saved to base_error.html")
            await browser.close()
            return

        print("[2] Filling form fields...")
        try:
            await page.fill("#AWBID", prefix)
            await page.fill("#AWBNumber", serial)
            print("[2] Fields filled. Clicking search button...")
            await page.click("#ImageButton1")
        except Exception as e:
            print(f"[!] Form interaction failed: {e}")
            with open("form_error.html", "w") as f:
                f.write(await page.content())
            await browser.close()
            return

        print("[3] Waiting 15s for results...")
        await asyncio.sleep(15)
        html = await page.content()

        print(f"[3] Final HTML length: {len(html)}")
        print(f"[3] 'DLV' in result: {'DLV' in html}")
        print(f"[3] 'ARR' in result: {'ARR' in html}")
        print(f"[3] 'outdated page' in result: {'access an outdated page' in html.lower()}")

        with open("debug_result.html", "w") as f:
            f.write(html)
        print("[3] Result HTML saved to debug_result.html")

        await browser.close()

asyncio.run(main())
