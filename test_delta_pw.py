import asyncio
from playwright.async_api import async_playwright

async def run(playwright):
    browser = await playwright.chromium.launch(
        headless=True,
        args=["--disable-blink-features=AutomationControlled"]
    )
    context = await browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport={"width": 1920, "height": 1080}
    )
    page = await context.new_page()
    url = "https://www.deltacargo.com/Cargo/trackShipment"
    print(f"Navigating to {url}")
    await page.goto(url)
    
    # Wait for the tracking form input
    await page.wait_for_selector("input#awbNumber", timeout=15000)
    
    # Fill AWB
    awb = "38686476" # Assuming prefix 006 is known/default, and we need just the serial
    await page.fill("input#awbNumber", awb)
    
    # Click search button
    await page.click("button.dc-search-button")
    
    print("Waiting for results...")
    await page.wait_for_timeout(10000) # Wait 10s for results to load
    
    html = await page.content()
    with open("delta_pw_result.html", "w") as f:
        f.write(html)
        
    print("Saved to delta_pw_result.html")
    await browser.close()

async def main():
    async with async_playwright() as playwright:
        await run(playwright)

if __name__ == "__main__":
    asyncio.run(main())
