import json
import re
import sys
import subprocess
import time
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

def parse_awb(raw_awb: str):
    awb = raw_awb.strip().replace("-", "").replace(" ", "")
    if len(awb) >= 11:
        return awb[:3], awb[3:11]
    return "114", awb

def scrape_elal_cdp(awb_full: str):
    prefix, serial = parse_awb(awb_full)
    url = f"https://www.elalextra.net/EWB/AIR2.aspx?AWBPrefix={prefix}&AWBNum={serial}"

    # Launch actual Chrome in the background with debugging port open
    # This bypasses all "headless" detection because it's the real browser
    print("[*] Launching system Chrome via CDP...")
    chrome_process = subprocess.Popen([
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "--remote-debugging-port=9222",
        "--user-data-dir=/tmp/chrome_profile", # Fresh profile
        "--headless=new", # new headless mode in Chrome 109+ is much harder to detect
        "--disable-gpu",
        "--no-sandbox",
        "--window-size=1920,1080"
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    time.sleep(3) # Wait for Chrome to start

    try:
        with sync_playwright() as p:
            print("[*] Connecting Playwright to Chrome...")
            browser = p.chromium.connect_over_cdp("http://localhost:9222")
            default_context = browser.contexts[0]
            page = default_context.pages[0] if default_context.pages else default_context.new_page()
            
            print(f"[*] Fetching {url}...")
            page.goto(url, wait_until="domcontentloaded", timeout=45000)
            
            # Wait for any Radware challenges
            for _ in range(5):
                html = page.content()
                if "kramericaindustries" not in html.lower() and "rbzns" not in html.lower():
                    break
                print("[*] Waiting for Radware challenge to clear...")
                page.wait_for_timeout(3000)
                
            html = page.content()
            browser.close()

        if "kramericaindustries" in html.lower() or "rbzns" in html.lower():
            print("[-] Radware bot block caught us even with Headless=New CDP.")
        else:
            print("[+] Radware cleared or not present!")
            
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

    finally:
        chrome_process.kill()

if __name__ == "__main__":
    awb = sys.argv[1] if len(sys.argv) > 1 else "11463866703"
    scrape_elal_cdp(awb)
