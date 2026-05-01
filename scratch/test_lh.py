"""Quick Lufthansa tracking test via BrightData Scraping Browser."""
import os, time
from playwright.sync_api import sync_playwright

proxy = os.environ.get("PREMIUM_PROXY_URL")

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(proxy)
    page = browser.new_page()

    page.goto("https://www.lufthansa-cargo.com/en/eservices/etracking", timeout=90000, wait_until="domcontentloaded")
    time.sleep(8)

    # Remove cookie overlay
    page.evaluate("() => { var u = document.getElementById('usercentrics-root'); if (u) u.remove(); }")
    time.sleep(1)

    # Fill prefix + serial separately
    prefix_input = page.query_selector("#etrk_awbp")
    serial_input = page.query_selector("#etrk_awbs")
    
    if prefix_input and serial_input:
        prefix_input.fill("020")
        serial_input.fill("22254186")
        time.sleep(1)
        
        # Click the Search button
        page.click("#etrk_awbsearch")
        print("Clicked search...")
        
        # Wait for navigation/results
        time.sleep(20)
        
        text = page.evaluate("() => document.body.innerText") or ""
        url = page.url
        print("FINAL URL:", url)
        print("PAGE TEXT LENGTH:", len(text))
        print("---TEXT---")
        print(text[:5000])
        print("---END---")
    else:
        print("Inputs not found!", "prefix:", prefix_input, "serial:", serial_input)

    browser.close()
