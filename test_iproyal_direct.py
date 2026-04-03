import urllib.request
import os
import json
from dotenv import load_dotenv

load_dotenv(".env-prod")
proxy_url = os.getenv("PROXY_URL")

proxies = {'http': proxy_url, 'https': proxy_url}
proxy_handler = urllib.request.ProxyHandler(proxies)
opener = urllib.request.build_opener(proxy_handler)

try:
    with opener.open("http://ip-api.com/json", timeout=10) as f:
        print("BASE PROXY (ip-api.com):", f.read().decode())
except Exception as e:
    print("BASE PROXY ERR:", e)
    
try:
    with opener.open("https://www.elalextra.net/info/awb.asp?aid=114&awb=21805243&Lang=Eng", timeout=10) as f:
        html = f.read().decode()
        if "Access Denied" in html:
            print("CURL: Akamai Blocked")
        else:
            print("CURL: OK, length=", len(html))
except Exception as e:
    print("CURL ERR:", e)
