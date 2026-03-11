import json
import re
import sys
import time
from bs4 import BeautifulSoup

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium_stealth import stealth

def parse_awb(raw_awb: str):
    awb = raw_awb.strip().replace("-", "").replace(" ", "")
    if len(awb) >= 11:
        return awb[:3], awb[3:11]
    return "114", awb

def scrape_elal_selenium_stealth(awb_full: str):
    prefix, serial = parse_awb(awb_full)
    url = f"https://www.elalextra.net/EWB/AIR2.aspx"
    
    options = Options()
    options.add_argument("--headless")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)
    
    driver = webdriver.Chrome(options=options)
    
    # Apply Selenium Stealth
    stealth(driver,
        languages=["en-US", "en"],
        vendor="Google Inc.",
        platform="Win32",
        webgl_vendor="Intel Inc.",
        renderer="Intel Iris OpenGL Engine",
        fix_hairline=True,
    )
    
    print(f"[*] Fetching {url} with Selenium-Stealth...")
    driver.get(url)
    
    time.sleep(10) # wait for radware
    
    try:
        prefix_input = driver.find_element("id", "AWBPrefix")
        prefix_input.clear()
        prefix_input.send_keys(prefix)
        
        serial_input = driver.find_element("id", "AWBNum")
        serial_input.clear()
        serial_input.send_keys(serial)
        
        btn = driver.find_element("id", "ImageButton1")
        btn.click()
        time.sleep(10)
    except Exception as e:
        print("Couldn't fill form, maybe we got an error page or radware block:", e)

    html = driver.page_source
    driver.quit()

    if "kramericaindustries" in html.lower() or "rbzns" in html.lower():
        print("[-] Radware bot block STILL caught us with final Selenium Stealth pattern.")
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
