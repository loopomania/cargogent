import urllib.request
import urllib.parse
import json
import ssl
from datetime import datetime

# 1. Read MAWBs
markdown = open("MAWB_TEST_LIST.md").read()
awbs = []
for line in markdown.split('\n'):
    if '|' in line and not line.startswith('| Airline'):
        parts = [p.strip() for p in line.split('|')]
        if len(parts) >= 4 and parts[3].replace('-', '').isdigit():
            airline = parts[1]
            awb = parts[3]
            awbs.append((airline, awb))

BASE_URL = "http://168.119.228.149"

# 2. Login
login_data = json.dumps({"email": "alon@cargogent.com", "password": "!A2sQWxz!ZX@"}).encode('utf-8')
req = urllib.request.Request(f"{BASE_URL}/api/auth/login", data=login_data, headers={"Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req) as resp:
        res_data = json.loads(resp.read().decode())
        token = res_data.get('token')
        if not token:
            print("Login failed, no token")
            exit(1)
except Exception as e:
    print("Login error:", e)
    if hasattr(e, 'read'): print(e.read().decode())
    exit(1)

print(f"Testing {len(awbs)} AWBs against Prod Admin Console ({BASE_URL}/api/track/...)\n")
print(f"{'Airline':<16}| {'AWB':<13}| {'Duration':<6}| {'Status':<7}| {'Events':<6}| {'Message'}")
print("-" * 100)

for airline, awb in awbs:
    url = f"{BASE_URL}/api/track/{urllib.parse.quote(airline.lower())}/{urllib.parse.quote(awb)}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    
    start_time = datetime.now()
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode())
            duration = (datetime.now() - start_time).total_seconds()
            status = data.get("status", "N/A")
            events_len = len(data.get("events", []))
            msg = data.get("message", "")
            print(f"{airline[:15]:<16}| {awb[:12]:<13}| {duration:>5.1f}s | {str(status)[:7]:<7}| {events_len:<6}| {msg}")
    except Exception as e:
        duration = (datetime.now() - start_time).total_seconds()
        try:
            err_msg = e.read().decode()
            try:
                err_msg = json.loads(err_msg).get("message", err_msg)
            except: pass
        except:
            err_msg = str(e)
        if "timeout" in err_msg.lower():
            err_msg = "Timeout (504/502/Exceeded)"
        print(f"{airline[:15]:<16}| {awb[:12]:<13}| {duration:>5.1f}s | ERROR  | 0     | {err_msg}")

