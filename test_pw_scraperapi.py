import asyncio, os, re
from playwright.async_api import async_playwright

base_url = "http://scraperapi:646f8dc2df9803bd9f8275c7c3d3f165@proxy-server.scraperapi.com:8001"
match = re.search(r'http://(?:(.*):(.*)@)?(.*):(\d+)', base_url)
user, password, host, port = match.groups()

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            proxy={
                "server": f"http://{host}:{port}",
                "username": user,
                "password": password
            },
            args=["--no-sandbox", "--disable-dev-shm-usage", "--ignore-certificate-errors"]
        )
        context = await browser.new_context(ignore_https_errors=True)
        page = await context.new_page()
        try:
            await page.goto("http://ip-api.com/json")
            text = await page.evaluate("document.body.innerText")
            print("PW SCRAPERAPI IP:", text[:150])
            
            await page.goto("https://www.elalextra.net/info/awb.asp?aid=114&awb=21805243&Lang=Eng")
            await page.wait_for_timeout(3000)
            text = await page.evaluate("document.body.innerText")
            if "Access Denied" in text:
                print("PW AKAMAI BLOCKED!")
            else:
                print("PW EL AL SUCCESS, length:", len(text))
                print(text[:200])
        except Exception as e:
            print("PW ERR:", e)
        finally:
            await browser.close()

asyncio.run(main())
