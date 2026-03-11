import asyncio
from playwright.async_api import async_playwright
import os

async def save_debug(awb, prefix, url, name, script_func):
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox"
            ]
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080}
        )
        page = await context.new_page()
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=60000)
            await page.wait_for_timeout(5000)
            await script_func(page, awb, prefix)
            await page.wait_for_timeout(7000)
            
            html = await page.content()
            with open(f"/Users/alonmarom/dev/browserMockup/{name}_debug.html", "w") as f:
                f.write(html)
            await page.screenshot(path=f"/Users/alonmarom/dev/browserMockup/{name}_debug.png")
            print(f"[+] {name} saved HTML ({len(html)} bytes) and PNG")
        except Exception as e:
            print(f"[-] {name} failed: {e}")
        finally:
            await browser.close()

async def elal_script(page, awb, prefix):
    for _ in range(3):
        html = await page.content()
        if "access an outdated page" not in html.lower():
            break
        await page.wait_for_timeout(3000)
    
    await page.wait_for_selector("#AWBID", timeout=15000)
    await page.fill("#AWBID", prefix)
    await page.fill("#AWBNumber", awb)
    
    try:
        async with page.expect_popup(timeout=30000) as popup_info:
            await page.click("#ImageButton1")
        popup = await popup_info.value
        await popup.wait_for_load_state("domcontentloaded", timeout=30000)
        await popup.wait_for_timeout(5000)
        
        await popup.screenshot(path="/Users/alonmarom/dev/browserMockup/elal_popup.png")
        html = await popup.content()
        with open("/Users/alonmarom/dev/browserMockup/elal_popup.html", "w") as f:
            f.write(html)
    except Exception as e:
        print(f"ElAl popup error: {e}")

async def lufthansa_script(page, awb, prefix):
    # Accept cookie banners if present.
    for selector in [
        "button:has-text('Accept all')",
        "button:has-text('Accept')",
        "button:has-text('I agree')",
    ]:
        loc = page.locator(selector)
        if await loc.count() > 0:
            try:
                await loc.first.click()
                await page.wait_for_timeout(1000)
                break
            except Exception:
                pass

    awb_full = awb
    locator = page.locator("input[name*='awb' i], input[placeholder*='AWB' i]").first
    if await locator.count() > 0:
        await locator.fill(awb_full)
    
    btn = page.locator("button:has-text('Track'), button:has-text('Search'), button[type='submit']").first
    if await btn.count() > 0:
        await btn.click()

async def main():
    await asyncio.gather(
        save_debug("63874650", "114", "https://www.elal.com/CargoApps/AIR2.aspx?Lang=Eng", "elal", elal_script),
        save_debug("02021483976", "020", "https://www.lufthansa-cargo.com/en/eservices/etracking", "lufthansa", lufthansa_script)
    )

if __name__ == "__main__":
    asyncio.run(main())
