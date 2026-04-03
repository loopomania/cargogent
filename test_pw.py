import asyncio, os, re
from playwright.async_api import async_playwright
from dotenv import load_dotenv

load_dotenv(".env-prod")
base_url = os.getenv("PROXY_URL")
match = re.search(r'http://(?:(.*):(.*)@)?(.*):(\d+)', base_url)
if match:
    user, password, host, port = match.groups()
else: exit(1)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            proxy={
                "server": f"http://{host}:{port}",
                "username": user,
                "password": password
            },
            args=["--no-sandbox", "--disable-dev-shm-usage"]
        )
        page = await browser.new_page()
        try:
            res = await page.goto("https://www.elalextra.net/info/awb.asp?aid=114&awb=21805243&Lang=Eng")
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
