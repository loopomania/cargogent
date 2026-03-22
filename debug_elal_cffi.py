from curl_cffi import requests as curl_requests
import sys
import os
import re

awb = '63888580'
url = f"https://www.elalextra.net/info/awb.asp?aid=114&awb={awb}&Lang=Eng"

print("--- Testing without Proxy ---")
try:
    r1 = curl_requests.get(url, impersonate="chrome124", timeout=15)
    print("Status:", r1.status_code)
    print("Text snippets:", r1.text[:200])
except Exception as e:
    print("Error:", e)

# Add AWBTrackers to sys.path
sys.path.append(os.path.join(os.getcwd(), 'AWBTrackers'))
from router import PROXY_URL

print("\n--- Testing with Proxy ---")
print("Proxy:", PROXY_URL)

proxies = None
if PROXY_URL:
    proxies = {"http": PROXY_URL, "https": PROXY_URL}

try:
    r2 = curl_requests.get(url, impersonate="chrome124", proxies=proxies, timeout=30)
    print("Status:", r2.status_code)
    print("Text snippets:", r2.text[:200])
except Exception as e:
    print("Error:", e)
