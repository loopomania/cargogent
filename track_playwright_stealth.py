import sys
import json
import re
import asyncio
from bs4 import BeautifulSoup

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("pip install playwright && playwright install chromium")
    sys.exit(1)

def parse_awb(raw_awb: str):
    awb = raw_awb.strip().replace("-", "").replace(" ", "")
    if len(awb) >= 11:
        return awb[:3], awb[3:11]
    return "114", awb

async def scrape_elal_pw_stealth(awb_full: str):
    prefix, serial = parse_awb(awb_full)
    url = f"https://www.elalextra.net/EWB/AIR2.aspx?AWBPrefix={prefix}&AWBNum={serial}"
    
    # We will try the absolute minimum fingerprint override technique
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--hide-scrollbars",
                "--mute-audio",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-infobars",
                "--ignore-certificate-errors",
                "--start-maximized"
            ]
        )
        
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=2,
            has_touch=False,
            is_mobile=False,
            color_scheme="light",
            locale="en-US",
            timezone_id="Asia/Jerusalem",
            permissions=["geolocation"],
            geolocation={"latitude": 32.0853, "longitude": 34.7818}
        )
        
        # Inject core stealth overrides before page load
        stealth_js = """
            // Pass webdriver check
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            
            // Pass chrome check
            window.chrome = {
                runtime: {}
            };
            
            // Pass plugins check
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3] 
            });
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });
            
            // Overwrite the `call` method used by some bot detectors to inspect stack traces
            const originalCall = Function.prototype.call;
            Function.prototype.call = function(...args) {
                return originalCall.apply(this, args);
            };
        """
        await context.add_init_script(stealth_js)
        
        page = await context.new_page()
        
        # Radware often fingerprints based on how mouse moves or basic interactions
        await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        
        print(f"[*] Analyzing {url} ...")
        
        # Wait for potential challenge loop
        for _ in range(6):
            html = await page.content()
            if "kramericaindustries" not in html.lower() and "rbzns" not in html.lower():
                break
            # Random mouse movements can sometimes bypass behavior tracking
            try:
                await page.mouse.move(100, 200)
                await page.mouse.down()
                await page.wait_for_timeout(100)
                await page.mouse.move(200, 300)
                await page.mouse.up()
            except Exception:
                pass
                
            print("[*] Waiting for challenge...")
            await page.wait_for_timeout(3000)
            
        html = await page.content()
        await browser.close()

    if "kramericaindustries" in html.lower() or "rbzns" in html.lower():
        print("[-] Blocked by Radware.")
    else:
        print("[+] Success!")
        
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style"]):
        tag.decompose()
        
    text = soup.get_text(" ", strip=True)
    text = re.sub(r"\s+", " ", text).strip()
    
    status = re.search(r"(?:Status|State)[:\s]+([A-Za-z\s]+?)(?:\n|$|,)", text, re.IGNORECASE)
    flight = re.search(r"(?:Flight|FLT)[:\s#]*([A-Z0-9]{2}\s*\d+)", text, re.IGNORECASE)
    origin = re.search(r"(?:Origin|From)[:\s]+([A-Z]{3}|[A-Za-z\s,]+?)(?:\n|$|\.)", text, re.IGNORECASE)
    dest = re.search(r"(?:Destination|To)[:\s]+([A-Z]{3}|[A-Za-z\s,]+?)(?:\n|$|\.)", text, re.IGNORECASE)
    
    events = []
    tables = soup.find_all("table")
    for table in tables:
        rows = table.find_all("tr")
        if len(rows) > 0:
            headers = [cell.get_text(strip=True) for cell in rows[0].find_all(["th", "td"])]
            for row in rows[1:]:
                cells = [cell.get_text(strip=True) for cell in row.find_all(["td", "th"])]
                if cells:
                    if headers:
                        mlen = min(len(headers), len(cells))
                        events.append(dict(zip(headers[:mlen], cells[:mlen])))
                    else:
                        events.append(" | ".join(cells))
                    
    tracking_data = {
        "awb": f"{prefix}-{serial}",
        "origin": origin.group(1).strip() if origin else None,
        "destination": dest.group(1).strip() if dest else None,
        "status": status.group(1).strip() if status else None,
        "flight": flight.group(1).strip() if flight else None,
        "events": events,
        "raw_text_extracted": text[:300] if len(events) == 0 else ""
    }
    
    print("\n[+] JSON Results:")
    print(json.dumps(tracking_data, indent=2))

if __name__ == "__main__":
    awb = sys.argv[1] if len(sys.argv) > 1 else "11463866703"
    asyncio.run(scrape_elal_pw_stealth(awb))
