import urllib.request
import os
from dotenv import load_dotenv

load_dotenv(".env-prod")
proxy_url = os.getenv("PROXY_URL")

# Without rotation
proxies = {'http': proxy_url, 'https': proxy_url}
proxy_handler = urllib.request.ProxyHandler(proxies)
opener = urllib.request.build_opener(proxy_handler)

try:
    with opener.open("http://ip-api.com/json", timeout=10) as f:
        print("BASE PROXY (ip-api.com):", f.read().decode())
except Exception as e:
    print("BASE PROXY ERR:", e)

