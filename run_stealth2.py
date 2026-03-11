import json
import re
import sys
from bs4 import BeautifulSoup
from undetected_playwright.sync_api import sync_playwright

def parse_awb(raw_awb: str):
    awb = raw_awb.strip().replace("-", "").replace(" ", "")
    if len(awb) >= 11:
        return awb[:3], awb[3:11]
    return "114", awb

def scrape_elal_stealth(awb_full: str):
    prefix, serial = parse_awb(awb_full)
    url = f"https://www.elalextra.net/EWB/AIR2.aspx?AWBPrefix={prefix}&AWBNum={serial}"
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080}
        )
        
        page = context.new_page()
        
        print(f"[*] Fetching {url} with undetected_playwright...")
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=45000)
            
            # Additional wait if we see the redirect page
            for _ in range(5):
                html = page.content()
                if "kramericaindustries" not in html.lower() and "rbzns" not in html.lower():
                    break
                print("[*] Waiting for Radware challenge to clear...")
                page.wait_for_timeout(3000)
                
            html = page.content()
            
        except Exception as e:
            print(f"Error fetching page: {e}")
            browser.close()
            return

        browser.close()

    if "kramericaindustries" in html.lower() or "rbzns" in html.lower():
        print("[-] Radware bot block STILL caught us even with undetected_playwright.")
    else:
        print("[+] Radware cleared!")
        
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
    scrape_elal_stealth(awb)
