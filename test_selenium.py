import json
import re
import sys
import time
from bs4 import BeautifulSoup

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options

def parse_awb(raw_awb: str):
    awb = raw_awb.strip().replace("-", "").replace(" ", "")
    if len(awb) >= 11:
        return awb[:3], awb[3:11]
    return "114", awb

def scrape_elal_selenium_stealth(awb_full: str):
    prefix, serial = parse_awb(awb_full)
    url = f"https://www.elalextra.net/EWB/AIR2.aspx?AWBPrefix={prefix}&AWBNum={serial}"
    
    options = Options()
    options.add_argument("--headless") 
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
    
    # Exclude the collection of enable-automation switches 
    options.add_experimental_option("excludeSwitches", ["enable-automation"]) 
    
    # Turn-off userAutomationExtension 
    options.add_experimental_option("useAutomationExtension", False) 
    
    driver = webdriver.Chrome(options=options)
    
    # Change navigator.webdriver
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})") 

    print(f"[*] Fetching {url} with Selenium stealth...")
    driver.get(url)
    
    time.sleep(10) # wait for radware
    
    html = driver.page_source
    driver.quit()

    if "kramericaindustries" in html.lower() or "rbzns" in html.lower():
        print("[-] Radware bot block STILL caught us with Selenium Stealth.")
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
    scrape_elal_selenium_stealth(awb)
