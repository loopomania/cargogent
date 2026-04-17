import requests
import json
import sys
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Dynamic args
if len(sys.argv) < 2:
    print("Usage: python3 fetch_debug_awb.py <awb> [hawb]")
    sys.exit(1)

awb = sys.argv[1]
hawb = sys.argv[2] if len(sys.argv) > 2 else ""

# The API usually takes the AWB prefix as part of the URL or detects it.
# Let's use the same logic as the dashboard: try /api/track/{awb}

login_url = "https://cargogent.com/api/auth/login"
login_payload = {"email": "alon@cargogent.com", "password": "!A2sQWxz!ZX@"}

print(f"Logging in to {login_url}...")
resp = requests.post(login_url, json=login_payload, verify=False)
if resp.status_code != 200:
    print(f"Login failed: {resp.status_code} {resp.text}")
    sys.exit(1)

token = resp.json().get('token')
if not token:
    # Some older versions use cookies, some use JWT. 
    # If no token, maybe it sets a cookie.
    print("No token in response, checking cookies...")
    cookies = resp.cookies
else:
    cookies = None

print(f"Tracking AWB: {awb} (HAWB: {hawb})...")
track_url = f"https://cargogent.com/api/track/{awb}"
if hawb:
    track_url += f"?hawb={hawb}"

headers = {}
if token:
    headers["Authorization"] = f"Bearer {token}"

resp = requests.get(track_url, headers=headers, cookies=cookies, verify=False)

if resp.status_code == 200:
    data = resp.json()
    print(json.dumps(data, indent=2))
else:
    print(f"Track failed: {resp.status_code} {resp.text}")
