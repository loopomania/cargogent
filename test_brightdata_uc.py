import time
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "AWBTrackers"))
# If local, mock get_proxy_extension
def get_proxy_extension_local(proxy_url, folder_path="/tmp/bd_ext"):
    from urllib.parse import urlparse, unquote
    parsed = urlparse(proxy_url)
    user = parsed.username
    password = parsed.password
    host = parsed.hostname
    port = parsed.port
    
    if not os.path.exists(folder_path):
        os.makedirs(folder_path)
    
    manifest_json = """
    {
        "version": "1.0.0",
        "manifest_version": 2,
        "name": "Chrome Proxy",
        "permissions": ["proxy", "tabs", "unlimitedStorage", "storage", "<all_urls>", "webRequest", "webRequestBlocking"],
        "background": {"scripts": ["background.js"]},
        "minimum_chrome_version":"22.0.0"
    }
    """
    
    background_js = """
    var config = {
            mode: "fixed_servers",
            rules: {
              singleProxy: { scheme: "http", host: "%s", port: parseInt(%s) },
              bypassList: ["localhost"]
            }
          };
    chrome.proxy.settings.set({value: config, scope: "regular"}, function() {});
    function callbackFn(details) { return { authCredentials: { username: "%s", password: "%s" } }; }
    chrome.webRequest.onAuthRequired.addListener(callbackFn, {urls: ["<all_urls>"]}, ['blocking']);
    """ % (host, port, user, password)
    
    with open(os.path.join(folder_path, "manifest.json"), "w") as f:
        f.write(manifest_json)
    with open(os.path.join(folder_path, "background.js"), "w") as f:
        f.write(background_js)
    return folder_path

try:
    import undetected_chromedriver as uc
except:
    print("UC not installed, run on prod!")
    sys.exit(1)
    
options = uc.ChromeOptions()
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36")

print("Setting up BrightData Residential proxy extension (WEB UNLOCKER PORT 22225)...")
bd_proxy = "http://brd-customer-hl_51634a60-zone-residential_proxy1:neqv1s4opx7z@brd.superproxy.io:22225"
ext_path = get_proxy_extension_local(bd_proxy, f"/tmp/bd_ext_{int(time.time()*100)}")
options.add_argument(f"--load-extension={ext_path}")

use_headless = sys.platform == "darwin"
try:
    print("Starting UC...")
    driver = uc.Chrome(options=options, headless=use_headless, use_subprocess=True, version_main=146)
    driver.set_page_load_timeout(45)
    
    url = "https://www.elalextra.net/info/awb.asp?aid=114&awb=63889490&Lang=Eng"
    print(f"Loading {url}...")
    driver.get(url)
    
    # Wait for page to load / Akamai redirect
    time.sleep(10)
    
    text = driver.execute_script("return document.body.innerText")
    print(f"Response length: {len(text)}")
    if "Air Waybill" in text and "114" in text:
        print("✅ SUCCESS! BrightData bypassed Akamai!")
    elif "Access Denied" in text:
        print("❌ BLOCKED BY AKAMAI (Got Access Denied)")
    else:
        print("⚠️ UNKNOWN RESULT")
        print(text[:250])
except Exception as e:
    print("Error:", e)
finally:
    if 'driver' in locals() and driver:
        driver.quit()
