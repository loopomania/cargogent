import urllib.request
import urllib.parse
import json
import ssl

BASE_URL = "https://cargogent.com"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

login_data = json.dumps({"email": "alon@cargogent.com", "password": "!A2sQWxz!ZX@"}).encode('utf-8')
req = urllib.request.Request(f"{BASE_URL}/api/auth/login", data=login_data, headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req, context=ctx) as resp:
    token = json.loads(resp.read().decode()).get('token')

url = f"{BASE_URL}/api/track/60753067696"
print("Triggering LIVE query for 60753067696...")
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
try:
    with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
        data = json.loads(resp.read().decode())
        print("Success! Pulled events count:", len(data.get("events", [])))
        print("Raw Meta:", data.get("raw_meta"))
        for e in data.get("events", []):
            print(f"{e.get('status_code')} {e.get('location')} ({e.get('date') or e.get('estimated_date')})")
except Exception as e:
    print("Error:", e.read().decode() if hasattr(e, 'read') else str(e))
