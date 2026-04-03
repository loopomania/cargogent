from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        def log_request(req):
            if "114" in req.url or "63889490" in req.url or "elal" in req.url:
                print(">> REQ:", req.url)
        def log_response(res):
            if "114" in res.url or "63889490" in res.url or "elal" in res.url:
                print("<< RES:", res.url, res.status)
                
        page.on("request", log_request)
        page.on("response", log_response)
        
        print("Navigating to track-trace...")
        page.goto("https://www.track-trace.com/aircargo")
        
        # Fill the input
        page.fill("#number", "114-63889490")
        page.click("button[type='submit']")
        
        print("Waiting 10 seconds...")
        page.wait_for_timeout(10000)
        
        print("Done.")
        browser.close()

if __name__ == "__main__":
    run()
