import requests
import json
import sys
import urllib3
urllib3.disable_warnings()

resp = requests.post('https://cargogent.com/api/auth/login', json={"email":"alon@cargogent.com","password":"!A2sQWxz!ZX@"}, verify=False)
if resp.status_code != 200:
    print(f"Login failed: {resp.text}")
    sys.exit(1)
token = resp.json()['token']

awbs = [
    ("057-00344746", "ISR10047053"), # Air France
    ("079-50741110", "ISR10047052")  # CargoPal
]

for awb, hawb in awbs:
    print(f"\n--- Testing {awb} + {hawb} ---")
    resp = requests.get(f'https://cargogent.com/api/track/{awb}?hawb={hawb}', headers={"Authorization": f"Bearer {token}"}, verify=False)
    if resp.status_code != 200:
        print(f"Track failed: {resp.text}")
        continue
        
    data = resp.json()
    print("Status:", data.get('status'), data.get('message'))
    print(f"Origin: {data.get('origin')} Dest: {data.get('destination')}")
    for i, e in enumerate(data.get('events', [])):
        print(f"{i:2}: {e.get('status_code')} {e.get('location')} {e.get('date')} | {e.get('remarks')}")
