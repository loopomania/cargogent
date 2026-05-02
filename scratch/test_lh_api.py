import os, time, json
from playwright.sync_api import sync_playwright

proxy = os.environ.get("PREMIUM_PROXY_URL")

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(proxy)
    # Open an empty page to establish the context
    page = browser.new_page()
    page.goto("https://www.lufthansa-cargo.com", timeout=60000)
    
    # Execute a fetch request from within the browser context
    script = """
    async () => {
        const res = await fetch('https://api-external.lufthansa-cargo.com/stp/shipments-details/02022254186', {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/plain, */*'
            }
        });
        if (!res.ok) {
            return "ERROR: " + res.status + " " + res.statusText;
        }
        const data = await res.json();
        return JSON.stringify(data);
    }
    """
    try:
        result = page.evaluate(script)
        print(">>> API FETCH RESULT:")
        print(result[:2000])
        print("...\n")
    except Exception as e:
        print("Fetch failed:", e)

    browser.close()
