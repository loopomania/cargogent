import urllib.request
import os
import ssl

proxy_url = "http://scraperapi:646f8dc2df9803bd9f8275c7c3d3f165@proxy-server.scraperapi.com:8001"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

proxies = {'http': proxy_url, 'https': proxy_url}
proxy_handler = urllib.request.ProxyHandler(proxies)
https_handler = urllib.request.HTTPSHandler(context=ctx)
opener = urllib.request.build_opener(proxy_handler, https_handler)

try:
    with opener.open("http://ip-api.com/json", timeout=15) as f:
        print("SCRAPERAPI IP:", f.read().decode()[:150])
except Exception as e:
    print("IP ERR:", e)
    
try:
    req = urllib.request.Request(
        "https://www.elalextra.net/info/awb.asp?aid=114&awb=21805243&Lang=Eng", 
        headers={"User-Agent":"Mozilla/5.0"}
    )
    with opener.open(req, timeout=30) as f:
        html = f.read().decode()
        if "Access Denied" in html:
            print("CURL: Akamai Blocked")
        elif "Link11 access denied" in html:
            print("CURL: Link11 Blocked")
        elif "Air Waybill" in html:
            print(f"CURL: SUCCESS! Length: {len(html)}")
            print(html[:200])
        else:
            print("CURL: OTHER (Kramerica?) Length:", len(html))
except Exception as e:
    print("CURL ERR:", e)
