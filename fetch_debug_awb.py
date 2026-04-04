import requests
import json
import sys

# Lufthansa prefix is 020. 114 is Northwest/Delta. 
# The user provided 114-63884461.
awb = "114-63884461"
hawb = "ISR10051451"

# Login to get token
login_url = "https://cargogent.com/api/auth/login"
login_payload = {"email": "alon@cargogent.com", "password": "!A2sQWxz!ZX@"}
resp = requests.post(login_url, json=login_payload, verify=False)
if resp.status_code != 200:
    print(f"Login failed: {resp.text}")
    sys.exit(1)
token = resp.json()['token']

# Track
track_url = f"https://cargogent.com/api/track/{awb}?hawb={hawb}"
headers = {"Authorization": f"Bearer {token}"}
resp = requests.get(track_url, headers=headers, verify=False)

if resp.status_code == 200:
    data = resp.json()
    print(json.dumps(data, indent=2))
else:
    print(f"Track failed: {resp.status_code} {resp.text}")
