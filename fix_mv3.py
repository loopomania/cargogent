import undetected_chromedriver as uc
import time, os, re
from dotenv import load_dotenv

load_dotenv(".env-prod")
base_url = "http://scraperapi:646f8dc2df9803bd9f8275c7c3d3f165@proxy-server.scraperapi.com:8001"
# match proxy url
match = re.search(r'http://(?:(.*):(.*)@)?(.*):(\d+)', base_url)
user, password, host, port = match.groups()

manifest_json = """
{
    "version": "1.0.0",
    "manifest_version": 3,
    "name": "Chrome Proxy Auto Auth",
    "permissions": ["proxy", "webRequest", "webRequestAuthProvider"],
    "host_permissions": ["<all_urls>"],
    "background": {
        "service_worker": "background.js"
    }
}
"""

background_js = """
var config = {
    mode: "fixed_servers",
    rules: {
      singleProxy: {
        scheme: "http",
        host: "%s",
        port: parseInt(%s)
      },
      bypassList: ["localhost"]
    }
};

chrome.proxy.settings.set({value: config, scope: "regular"}, function() {});

chrome.webRequest.onAuthRequired.addListener(
    function(details) {
        return {
            authCredentials: {
                username: "%s",
                password: "%s"
            }
        };
    },
    {urls: ["<all_urls>"]},
    ['blocking']
);
""" % (host, port, user, password)

os.makedirs("/tmp/ext_final_test", exist_ok=True)
with open("/tmp/ext_final_test/manifest.json", "w") as f: f.write(manifest_json)
with open("/tmp/ext_final_test/background.js", "w") as f: f.write(background_js)

options = uc.ChromeOptions()
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--disable-gpu")
options.add_argument("--load-extension=/tmp/ext_final_test")
options.add_argument('--ignore-certificate-errors')

driver = uc.Chrome(options=options, headless=False, use_subprocess=True, version_main=146)
try:
    driver.get("http://api.ipify.org")
    time.sleep(3)
    ip_text = driver.execute_script("return document.body.innerText")
    print("UC PROXY IP:", ip_text)

    driver.get("https://www.elalextra.net/info/awb.asp?aid=114&awb=21805243&Lang=Eng")
    time.sleep(4)
    elal_text = driver.execute_script("return document.body.innerText")
    
    if "Access Denied" in elal_text:
        print("ELAL: AKAMAI BLOCKED")
    elif "Link11" in elal_text:
        print("ELAL: Link11 BLOCKED")
    elif "kramericaindustries" in elal_text or len(elal_text) < 600:
        print("ELAL: KRAMERICA JS NOT EXECUTED", len(elal_text))
    else:
        print("ELAL: SUCCESS!! Length:", len(elal_text))
        print(elal_text[:200])

finally:
    try: driver.quit()
    except: pass
