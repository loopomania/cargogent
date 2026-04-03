import urllib.request
import urllib.parse
import json
from datetime import datetime

airline="el al"
awb="11421805243"
BASE_URL = "https://cargogent.com"

# Login
login_data = json.dumps({"email": "alon@cargogent.com", "password": "!A2sQWxz!ZX@"}).encode('utf-8')
req = urllib.request.Request(f"{BASE_URL}/api/auth/login", data=login_data, headers={"Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req) as resp:
        token = json.loads(resp.read().decode()).get('token')
except Exception as e:
    print("Login err:", e)
    token = ""

# Query
url = f"{BASE_URL}/api/track/elal/11421805243"
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})

start_time = datetime.now()
try:
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode())
        dur = (datetime.now() - start_time).total_seconds()
        print(f"El Al | {awb} | {dur:>5.1f}s | {str(data.get('status'))[:7]:<7} | {len(data.get('events', [])):<6} | {str(data.get('message'))[:30]}")
except Exception as e:
    dur = (datetime.now() - start_time).total_seconds()
    err = str(e)
    if hasattr(e, 'read'):
         err = e.read().decode()
    print(f"El Al | {awb} | {dur:>5.1f}s | ERROR   | 0      | {err[:60]}")
