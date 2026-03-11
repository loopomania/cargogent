import json
import re
import sys
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

def parse_awb(raw_awb: str):
    awb = raw_awb.strip().replace("-", "").replace(" ", "")
    if len(awb) >= 11:
        return awb[:3], awb[3:11]
    return "114", awb

def scrape_main_site(awb_full: str):
    prefix, serial = parse_awb(awb_full)
    # This is the visible site the user sees
    url = f"https://www.elal.com/en/Cargo/Pages/Online-Tracking.aspx"

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-blink-features=AutomationControlled"], headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080}
        )
        page = context.new_page()
        
        print(f"[*] Fetching tracking page {url} in headless browser...")
        try:
            page.goto(url, wait_until="networkidle", timeout=30000)
            
            # The form is actually inside an iframe:
            iframe_el = page.locator('iframe[src*="AIR2.aspx"]')
            if iframe_el.count() == 0:
                print("[-] Couldn't find iframe. HTML snippet:")
                print(page.content()[:500])
                browser.close()
                return
                
            frame = iframe_el.element_handle().content_frame()
            
            frame.fill("#AWBID", prefix)
            frame.fill("#AWBNumber", serial)
            
            print("[*] Clicking track button inside iframe...")
            # Setup network response capture in case data comes back over XHR instead of page load
            
            responses = []
            def handle_response(response):
                if response.ok and response.request.resource_type in ["fetch", "xhr", "document"]:
                    try:
                        text = response.text()
                        if "status:" in text.lower() or "flight" in text.lower() or serial in text:
                            responses.append(text)
                    except:
                        pass
            
            context.on("response", handle_response)
            
            frame.click("#ImageButton1")
            
            page.wait_for_timeout(10000)
            
            # Did it open a popup?
            if len(context.pages) > 1:
                html = context.pages[1].content()
            else:
                html = frame.content()
                
            browser.close()
            
        except Exception as e:
            print(f"Error: {e}")
            browser.close()
            return

    if "kramericaindustries" in html.lower() or "rbzns" in html.lower():
        print("[-] Radware block.")
    else:
        print("[+] Extracted!")
        
    for r in responses:
        print("Captured network response containing AWB or keywords:")
        print(r[:300])
        
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
    scrape_main_site(awb)
