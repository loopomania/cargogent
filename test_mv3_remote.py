import undetected_chromedriver as uc
import time, os, re
from dotenv import load_dotenv

load_dotenv(".env-prod")
base_url = os.getenv("PROXY_URL")
if not base_url: exit(1)

match = re.search(r'http://(?:(.*):(.*)@)?(.*):(\d+)', base_url)
user, password, host, port = match.groups()

manifest_json = """
{
    "version": "1.0.0",
    "manifest_version": 3,
    "name": "Chrome Proxy",
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
      singleProxy: { scheme: "http", host: "%s", port: parseInt(%s) },
      bypassList: ["localhost"]
    }
};
chrome.proxy.settings.set({value: config, scope: "regular"}, function() {});

chrome.webRequest.onAuthRequired.addListener(
    function(details, callback) {
        callback({
            authCredentials: { username: "%s", password: "%s" }
        });
    },
    {urls: ["<all_urls>"]},
    ['asyncBlocking']
);
""" % (host, port, user, password)

os.makedirs("/tmp/ext_mv3", exist_ok=True)
with open("/tmp/ext_mv3/manifest.json", "w") as f: f.write(manifest_json)
with open("/tmp/ext_mv3/background.js", "w") as f: f.write(background_js)

options = uc.ChromeOptions()
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--disable-gpu")
options.add_argument("--load-extension=/tmp/ext_mv3")

driver = uc.Chrome(options=options, headless=False, use_subprocess=True, version_main=146)
try:
    driver.get("http://api.ipify.org")
    time.sleep(3)
    text = driver.execute_script("return document.body.innerText")
    print("EXT IP:", text)
finally:
    driver.quit()
