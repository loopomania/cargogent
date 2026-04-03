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
options.add_argument("--disable-gpu")
options.add_argument("--window-size=1920,1080")
options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36")

use_headless = sys.platform == "darwin" and not proxy
proxy_ext_path = None

if proxy:
    print("Setting up proxy...")
    session_id = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    rotated_proxy = get_rotating_proxy(proxy, session_id=session_id)
    proxy_ext_path = get_proxy_extension(rotated_proxy, f"/tmp/proxy_ext_tt_{int(time.time()*100)}")
    if proxy_ext_path:
        options.add_argument(f"--load-extension={proxy_ext_path}")
        use_headless = False
        print("Loaded proxy extension")
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
    
    # Track-trace supports direct URL routing via path
    # e.g. https://www.track-trace.com/aircargo#114-63889490
    driver.get("https://www.track-trace.com/aircargo#" + awb)
    time.sleep(5)
    
    # Alternatively, find the input and click Track
    try:
        input_box = driver.find_element(By.ID, "number")
        input_box.clear()
        input_box.send_keys(awb)
        btn = driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
        btn.click()
        print("Clicked Track!")
        time.sleep(8)
    except Exception as e:
        print("Could not type into input box (maybe it auto-submitted?):", e)
    
    # Wait for results or iframe
    # track-trace often embeds the original airline's tracking page in an iframe!
    # Or scrapes it into their own UI.
    driver.save_screenshot("/tmp/tt_main.png")
    text = driver.execute_script("return document.body.innerText")
    print("Length of result text:", len(text))
    # Check for iframe
    iframes = driver.find_elements(By.TAG_NAME, "iframe")
    print(f"Found {len(iframes)} iframes on the page.")
    
    for idx, iframe in enumerate(iframes):
        try:
            src = iframe.get_attribute("src")
            print(f"Iframe {idx} src: {src}")
        except:
            pass
            
        print(f"Switching to iframe {idx}...")
        try:
            driver.switch_to.frame(iframe)
            time.sleep(1)
            driver.save_screenshot(f"/tmp/tt_iframe_{idx}.png")
            iframe_text = driver.execute_script("return document.body.innerText")
            print(f"Iframe {idx} text length: {len(iframe_text)}")
            if iframe_text and "Access Denied" in iframe_text:
                print(f"!!! IFRAME {idx} BLOCKED BY AKAMAI !!!")
            elif iframe_text:
                print(f"Iframe snippet: {iframe_text[:150].replace(chr(10), ' ')}")
        except Exception as e:
            pass
        finally:
            driver.switch_to.default_content()

except Exception as e:
    print("Error:", e)
finally:
    if driver:
        driver.quit()
    if proxy_ext_path:
        shutil.rmtree(proxy_ext_path, ignore_errors=True)
