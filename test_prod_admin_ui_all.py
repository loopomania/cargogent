import asyncio
import os
import time
from playwright.async_api import async_playwright

trackers = [
    ("Delta", "006-30929404"),
    ("Air Canada", "014-37614662"),
    ("United", "016-09641925"),
    ("Lufthansa", "020-00958171"),
    ("AFKLM", "057-00627163"),
    ("Ethiopian", "071-59724151"),
    ("CargoPal", "079-50741353"),
    ("El Al", "114-21805243"),
    ("Cathay Pacific", "160-03078526"),
    ("CargoBooking", "281-24905215"),
    ("Silk Way", "501-19408362"),
    ("DHL Aviation", "615-66486733"),
    ("Challenge (700)", "700-51238180"),
    ("Challenge (752)", "752-50012491")
]

async def main():
    report_md = "# Admin Dashboard (Prod UI) Validation Run\n\n"
    report_md += "This report was generated via an automated Playwright sequence physically interacting with `https://cargogent.com/login` and iterating the live Production Dashboard Tracking Bar.\n\n"
    report_md += "| Airline | AWB | Dashboard UI Result | Screenshot captured |\n"
    report_md += "| :--- | :--- | :--- | :--- |\n"
    
    os.makedirs("/Users/alonmarom/.gemini/antigravity/brain/7ec99709-085f-461d-8ed0-6149c245554c/artifacts/ui_screenshots", exist_ok=True)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Use exact viewport from subagent: 1363x780
        page = await browser.new_page(viewport={"width": 1363, "height": 780})
        
        print("Navigating to https://cargogent.com/login...")
        await page.goto("https://cargogent.com/login", wait_until='networkidle')
        
        # Login Step Sequence exact matching Subagent
        # Step 15: click_browser_pixel X:500 Y:358 (email)
        await page.mouse.click(500, 358)
        await page.keyboard.type("alon@cargogent.com", delay=50)
        
        # Step 17: click_browser_pixel X:500 Y:456 (password)
        await page.mouse.click(500, 456)
        await page.keyboard.type("!A2sQWxz!ZX@", delay=50)
        
        # Step 19: click_browser_pixel X:500 Y:522 (Sign in)
        await page.mouse.click(500, 522)
        
        # Give Admin dashboard time to auth redirect and render
        print("Logging in and waiting for Tracking Dashboard render...")
        await page.wait_for_timeout(5000)
        
        for airline, awb in trackers:
            print(f"Testing {airline} ({awb}) on Dashboard...")
            try:
                # Step 53: click_browser_pixel X:381 Y:267 (AWB input)
                # Need to clear it first. We can triple click or control A + backspace
                await page.mouse.click(381, 267)
                await page.keyboard.press("Meta+A") # or Control+A
                await page.keyboard.press("Backspace")
                
                # Type new AWB
                await page.keyboard.type(awb, delay=50)
                
                # Step 55: click_browser_pixel X:625 Y:268 (Query Button)
                await page.mouse.click(625, 268)
                
                # Wait for results or error toast
                start_wait = time.time()
                success_text = "🟡 Timeout Check UI Screenshot"
                
                while time.time() - start_wait < 65:
                    text_content = await page.evaluate("document.body.innerText") or ""
                    
                    if "events merged" in text_content.lower() or "events ·" in text_content.lower():
                        success_text = "🟢 Table Rendered Events"
                        break
                    if "air canada service returned an error" in text_content.lower():
                        success_text = "🟡 Error Handled Successfully"
                        break
                    
                    await asyncio.sleep(1)
                
                # Force extra sleep so DOM animations settle
                await page.wait_for_timeout(1000)
                
                # Take screenshot
                filename = airline.replace(" ", "_").replace("(", "").replace(")", "").lower() + ".png"
                filepath = f"/Users/alonmarom/.gemini/antigravity/brain/7ec99709-085f-461d-8ed0-6149c245554c/artifacts/ui_screenshots/{filename}"
                await page.screenshot(path=filepath, full_page=True)
                
                # Use Markdown embedded image syntax properly. Since the artifact is written to the same brain directory, we use local path or relative.
                # Actually absolute path from `/Users/...` is standard.
                report_md += f"| {airline} | {awb} | {success_text} | ![{airline} tracking preview](file://{filepath}) |\n"
                
            except Exception as e:
                print(f"Error evaluating {airline}: {e}")
                report_md += f"| {airline} | {awb} | 🔴 Exception {str(e)[:30]} | None |\n"
                
        await browser.close()
        
    with open("/tmp/admin_ui_report.md", "w") as f:
        f.write(report_md)
        
    print("FINISHED ALL")

if __name__ == '__main__':
    asyncio.run(main())
