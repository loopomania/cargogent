import os, time, json
from playwright.sync_api import sync_playwright

proxy = os.environ.get("PREMIUM_PROXY_URL")

def handle_response(response):
    url = response.url.lower()
    # Look for API calls that might contain tracking data
    if ("track" in url or "shipment" in url or "api" in url) and response.request.resource_type in ["fetch", "xhr"]:
        print(f"\n>>> INTERCEPTED API CALL: {response.url} (Status: {response.status})")
        try:
            data = response.json()
            # Print the first 1000 chars of the JSON response
            print(json.dumps(data, indent=2)[:1000])
            print("...\n")
        except Exception:
            pass

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(proxy)
    page = browser.new_page()
    
    # Listen to all network responses
    page.on("response", handle_response)

    print("Navigating to tracking page...")
    page.goto("https://www.lufthansa-cargo.com/en/eservices/etracking", timeout=90000, wait_until="domcontentloaded")
    time.sleep(8)

    # Remove cookie overlay
    page.evaluate("() => { var u = document.getElementById('usercentrics-root'); if (u) u.remove(); }")
    time.sleep(1)

    prefix_input = page.query_selector("#etrk_awbp")
    serial_input = page.query_selector("#etrk_awbs")
    
    if prefix_input and serial_input:
        print("Filling AWB 020-22254186...")
        prefix_input.fill("020")
        serial_input.fill("22254186")
        time.sleep(1)
        
        print("Clicking search...")
        page.click("#etrk_awbsearch")
        
        # Wait 20 seconds to collect network traffic
        time.sleep(20)
    else:
        print("Inputs not found")

    browser.close()
