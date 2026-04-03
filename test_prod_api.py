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

resp = requests.get('https://cargogent.com/api/track/00638686476?hawb=ISR10047246', headers={"Authorization": f"Bearer {token}"}, verify=False)
if resp.status_code != 200:
    print(f"Track failed: {resp.text}")
    sys.exit(1)

data = resp.json()
print("Status:", data.get('status'), data.get('message'))
print("AWB Info:")
print(f"Origin: {data.get('origin')} Dest: {data.get('destination')} Flight: {data.get('flight')}")
print("Events:")
for i, e in enumerate(data.get('events', [])):
    print(f"{i:2}: {e.get('status_code')} {e.get('location')} {e.get('date')} | {e.get('remarks')}")
