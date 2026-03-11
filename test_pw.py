import asyncio
from playwright.async_api import async_playwright

async def run(awb):
    prefix = awb[:3]
    serial = awb[3:]
    base_url = "https://www.elal.com/CargoApps/AIR2.aspx?Lang=Eng"

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"]
        )
        context = await browser.new_context()
        page = await context.new_page()
        
        print("Getting cookie via AIR2.aspx...")
        await page.goto(base_url, wait_until="domcontentloaded", timeout=45000)
        
        print("Waiting for bot check...")
        for _ in range(5):
            html = await page.content()
            if "kramericaindustries" not in html.lower() and "rbzns" not in html.lower():
                break
            await page.wait_for_timeout(3000)
            
        track_url = f"https://www.elalextra.net/info/awb.asp?aid={prefix}&awb={serial}&Lang=Eng"
        print(f"Navigating directly to tracking URL: {track_url}")
        await page.goto(track_url, wait_until="domcontentloaded", timeout=45000)
        
        html = await page.content()
        print(f"HTML length: {len(html)}")
        if len(html) < 1000:
            print(html)
        
        # Check if events table exists
        if "63866703" in html:
            print("AWB found in result!")
        if "outdated page" in html.lower():
            print("Got an outdated page!")
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run("11463866703"))
