import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import sys
import os
import random
import string
import shutil
from dotenv import load_dotenv

sys.path.append(os.path.join(os.path.dirname(__file__), "AWBTrackers"))
from airlines.proxy_util import get_rotating_proxy, get_proxy_extension

load_dotenv(os.path.join(os.path.dirname(__file__), "AWBTrackers", ".env-prod"))
proxy = os.getenv("PROXY_URL")

options = uc.ChromeOptions()
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
# Consistent Desktop User Agent
options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36")
options.add_argument("--window-size=1920,1080")

use_headless = sys.platform == "darwin" and not proxy
proxy_ext_path = None

if proxy:
    print("Setting up proxy...")
    session_id = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    rotated_proxy = get_rotating_proxy(proxy, session_id=session_id)
    proxy_ext_path = get_proxy_extension(rotated_proxy, f"/tmp/proxy_ext_tt2_{int(time.time()*100)}")
    if proxy_ext_path:
        options.add_argument(f"--load-extension={proxy_ext_path}")
        use_headless = False
        print("Loaded proxy extension with session:", session_id)
    else:
        options.add_argument(f"--proxy-server={rotated_proxy}")
        print("Loaded proxy server arg")

driver = None
try:
    print("Starting UC...")
    driver = uc.Chrome(options=options, headless=use_headless, use_subprocess=True, version_main=146)
    driver.set_page_load_timeout(45)
    
    awb = "114-63889490"
    print(f"Loading track-trace for {awb}...")
    
    driver.get("https://www.track-trace.com/aircargo#" + awb)
    time.sleep(3)
    
    try:
        input_box = driver.find_element(By.ID, "number")
        input_box.clear()
        input_box.send_keys(awb)
        btn = driver.find_element(By.CSS_SELECTOR, "div.sform2 button.btn-b")
        print("Clicking 'Track!'...")
        btn.click()
        time.sleep(6)
    except Exception as e:
        print("Could not type or click:", type(e).__name__)
        print(driver.execute_script("return document.body.innerHTML")[:500])
    
    # Check current URL, handles new windows, etc
    print("Current URL after click:", driver.current_url)
    
    # If standard track-trace, they might be opening a new window if track-direct!
    # Let's switch to the newest window
    if len(driver.window_handles) > 1:
        driver.switch_to.window(driver.window_handles[-1])
        print("Switched to new window:", driver.current_url)
        time.sleep(3)
    
    text = driver.execute_script("return document.body.innerText")
    
    print("Length of result text:", len(text))
    if "Access Denied" in text:
        print("!!! BLOCKED BY AKAMAI !!!")
    elif "Air Waybill" in text:
        print("SUCCESS!!!")
    else:
        print("UNKNOWN RESULT. Snippet:")
        print(text[:400].replace(chr(10), " "))
    
except Exception as e:
    print("Error:", e)
finally:
    if driver:
        driver.quit()
    if proxy_ext_path:
        shutil.rmtree(proxy_ext_path, ignore_errors=True)
