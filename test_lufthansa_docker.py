import asyncio
from playwright.async_api import async_playwright

async def run():
    url = "https://www.lufthansa-cargo.com/en/eservices/etracking"
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox"
            ]
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        print(f"[*] Navigating to {url}")
        
        await page.goto(url, wait_until="domcontentloaded")
        await page.wait_for_timeout(10000)
        
        html = await page.content()
        print(f"Final HTML length: {len(html)}")
        if "cf-turnstile" in html.lower() or "challenge" in html.lower():
            print("[-] Hit Cloudflare challenge page.")
        else:
            print("[+] Bypassed Cloudflare successfully.")
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
