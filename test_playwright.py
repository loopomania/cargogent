import asyncio
from playwright.async_api import async_playwright

async def test():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await context.new_page()

        print("Navigating to base URL...")
        await page.goto("https://www.elal.com/CargoApps/AIR2.aspx?Lang=Eng", wait_until="domcontentloaded", timeout=45000)
        
        await page.wait_for_timeout(3000)
        
        print("Filling form...")
        await page.wait_for_selector("#AWBID", timeout=15000)
        await page.fill("#AWBID", "114")
        await page.fill("#AWBNumber", "11111111")
        
        print("Clicking GO...")
        try:
            async with page.expect_popup(timeout=10000) as popup_info:
                await page.click("#ImageButton1")
            popup = await popup_info.value
            await popup.wait_for_load_state("domcontentloaded")
            print("Popup opened! URL:", popup.url)
            html = await popup.content()
            print("Popup title:", await popup.title())
        except Exception as e:
            print("No popup detected or error:", e)
            print("Checking if main page navigated...")
            print("Main page URL:", page.url)
            print("Main page title:", await page.title())

        await browser.close()

if __name__ == "__main__":
    asyncio.run(test())
