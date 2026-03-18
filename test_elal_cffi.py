
import json
import re
from curl_cffi import requests
from typing import List, Optional

def normalize_awb(raw_awb: str, default_prefix: str = "114"):
    awb = raw_awb.strip().replace("-", "").replace(" ", "")
    if len(awb) >= 11 and awb[:11].isdigit():
        return awb[:3], awb[3:11]
    if len(awb) == 8 and awb.isdigit():
        return default_prefix, awb
    return default_prefix, awb

def test_elal_cffi(awb: str, proxy: str = None):
    prefix, serial = normalize_awb(awb)
    print(f"Tracking {prefix}-{serial} with proxy {proxy}")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": "https://www.elal.com/en/Cargo/Pages/Online-Tracking.aspx"
    }
    
    session = requests.Session(proxy=proxy, impersonate="chrome110")
    
    # Step 1: Visit main page to get cookies
    print("Visiting main page...")
    resp = session.get("https://www.elal.com/en/Cargo/Pages/Online-Tracking.aspx", timeout=30)
    print(f"Main page status: {resp.status_code}, Cookies: {session.cookies.get_dict()}")
    
    # Step 2: Call AJAX
    ajax_url = f"https://www.elal.com/ElalCargo/ajax/getStations?awbTrackNum={serial}&airlineId={prefix}"
    print(f"Calling AJAX: {ajax_url}")
    resp = session.post(ajax_url, headers=headers, timeout=30)
    print(f"AJAX status: {resp.status_code}")
    try:
        data = resp.json()
        print(f"Data received: {len(data)} events")
        print(json.dumps(data, indent=2))
        return True
    except Exception as e:
        print(f"Failed to parse JSON: {e}")
        print(f"Body snippet: {resp.text[:200]}")
        
    # Step 3: Try legacy fallback
    legacy_url = f"https://www.elalextra.net/info/awb.asp?aid={prefix}&awb={serial}&Lang=Eng"
    print(f"Calling Legacy: {legacy_url}")
    resp = session.get(legacy_url, timeout=30)
    print(f"Legacy status: {resp.status_code}")
    if "Origin" in resp.text and "Destination" in resp.text:
        print("Legacy data found in HTML!")
        return True
    else:
        print("Legacy data not found.")
        return False

if __name__ == "__main__":
    import sys
    awb = sys.argv[1] if len(sys.argv) > 1 else "01437623036"
    # Use proxy from .env if available
    proxy = None
    try:
        with open(".env", "r") as f:
            for line in f:
                if line.startswith("PROXY_URL="):
                    proxy = line.split("=", 1)[1].strip().strip('"').strip("'")
    except: pass
    
    test_elal_cffi(awb, proxy=proxy)
