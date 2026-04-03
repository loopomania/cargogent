import urllib.request
import urllib.parse
import json
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
            if airline in ["Air Canada", "El Al", "Cathay Pacific", "Silk Way", "DHL Aviation"]:
                awbs.append((airline, awb))

BASE_URL = "http://168.119.228.149"

# 2. Login
login_data = json.dumps({"email": "alon@cargogent.com", "password": "!A2sQWxz!ZX@"}).encode('utf-8')
req = urllib.request.Request(f"{BASE_URL}/api/auth/login", data=login_data, headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req) as resp:
    token = json.loads(resp.read().decode()).get('token')

for airline, awb in awbs:
     # map specific ones
    fixed_airline = airline.lower().replace(" ", "")
    if airline == "Cathay Pacific": fixed_airline = "cathay"
    elif airline == "DHL Aviation": fixed_airline = "dhl"
    url = f"{BASE_URL}/api/track/{urllib.parse.quote(fixed_airline)}/{urllib.parse.quote(awb)}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    
    start_time = datetime.now()
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode())
            dur = (datetime.now() - start_time).total_seconds()
            print(f"{airline:<15} | {awb:<12} | {dur:>5.1f}s | {str(data.get('status'))[:7]:<7} | {len(data.get('events', [])):<6} | {str(data.get('message'))[:30]}")
    except Exception as e:
        dur = (datetime.now() - start_time).total_seconds()
        print(f"{airline:<15} | {awb:<12} | {dur:>5.1f}s | ERROR   | 0      | {str(e)[:30]}")

