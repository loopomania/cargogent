import os, json
from playwright.sync_api import sync_playwright

proxy = os.environ.get("PREMIUM_PROXY_URL")

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(proxy)
    page = browser.new_page()
    
    # We need to be on the same domain to avoid CORS issues if any,
    # or just to get the right cookies initialized if necessary.
    page.goto("https://www.lufthansa-cargo.com", timeout=60000)
    
    script = """
    async () => {
        const res = await fetch('https://api-external.lufthansa-cargo.com/stp/shipments-details/02022254186', {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/plain, */*'
            }
        });
        if (!res.ok) {
            return {error: res.status + " " + res.statusText};
        }
        return await res.json();
    }
    """
    
    try:
        data = page.evaluate(script)
        print("=== JSON START ===")
        print(json.dumps(data, indent=2))
        print("=== JSON END ===")
    except Exception as e:
        print("ERROR:", e)

    browser.close()
