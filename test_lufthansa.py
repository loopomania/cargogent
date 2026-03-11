import asyncio
from playwright.async_api import async_playwright

async def run():
    url = "https://www.lufthansa-cargo.com/en/eservices/etracking"
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"]
        )
        context = await browser.new_context()
        page = await context.new_page()
        print(f"[*] Navigating to {url}")
        
        # intercept responses
        page.on("response", lambda response: print(f"<< {response.status} {response.url}"))
        
        await page.goto(url, wait_until="networkidle")
        await page.wait_for_timeout(5000)
        
        # Try to find exactly what tracking form fields are visible
        html = await page.content()
        print(f"Final HTML length: {len(html)}")
        if "tracking" in html.lower():
            print("Found tracking string in HTML")
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
