import time
import undetected_chromedriver as uc

options = uc.ChromeOptions()
# Must not use typical headless arg or Cloudflare detects it. 
# We use a trick to run windowless or simply rely on the docker Xvfb for headless.

try:
    driver = uc.Chrome(options=options, headless=True)
    print("Navigating to Lufthansa...")
    driver.get("https://www.lufthansa-cargo.com/en/eservices/etracking/awb-details/-/awb/020/21483976?searchFilter=awb")
    time.sleep(15)
    html = driver.page_source
    print("Length of HTML:", len(html))
    print("Cloudflare detected:", 'cloudflare' in html.lower())
    driver.quit()
except Exception as e:
    print(e)
