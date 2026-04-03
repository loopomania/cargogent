import undetected_chromedriver as uc
import time, os, threading, base64
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.request

class ProxyHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        url = self.path
        req = urllib.request.Request(url)
        auth = base64.b64encode(b"scraperapi:646f8dc2df9803bd9f8275c7c3d3f165").decode("ascii")
        req.add_header("Proxy-Authorization", f"Basic {auth}")
        proxy_handler = urllib.request.ProxyHandler({'http': 'http://proxy-server.scraperapi.com:8001', 'https': 'http://proxy-server.scraperapi.com:8001'})
        opener = urllib.request.build_opener(proxy_handler)
        try:
            with opener.open(req) as response:
                self.send_response(response.status)
                for k,v in response.getheaders(): self.send_header(k, v)
                self.end_headers()
                self.wfile.write(response.read())
        except Exception as e:
            self.send_response(500)
            self.end_headers()

def run_proxy():
    print("Starting local proxy on 8888...")
    server = HTTPServer(('127.0.0.1', 8888), ProxyHandler)
    server.serve_forever()

threading.Thread(target=run_proxy, daemon=True).start()
time.sleep(2)

options = uc.ChromeOptions()
options.add_argument("--proxy-server=http://127.0.0.1:8888")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--ignore-certificate-errors")

driver = uc.Chrome(options=options, headless=False, use_subprocess=True, version_main=146)
try:
    driver.get("http://api.ipify.org")
    time.sleep(3)
    text = driver.execute_script("return document.body.innerText")
    print("FORWARDED IP:", text[:150])
    
    driver.get("https://www.elalextra.net/info/awb.asp?aid=114&awb=21805243&Lang=Eng")
    time.sleep(4)
    elal = driver.execute_script("return document.body.innerText")
    if "Access Denied" in elal:
        print("ELAL: AKAMAI BLOCKED")
    else:
        print("ELAL SUCCESS", len(elal))
finally:
    try: driver.quit()
    except: pass
