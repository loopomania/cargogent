import urllib.request, json, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE_URL = 'https://cargogent.com'
login_data = json.dumps({'email': 'alon@cargogent.com', 'password': '!A2sQWxz!ZX@'}).encode('utf-8')
req = urllib.request.Request(f'{BASE_URL}/api/auth/login', data=login_data, headers={'Content-Type': 'application/json'})

with urllib.request.urlopen(req, context=ctx) as resp:
    token = json.loads(resp.read().decode()).get('token')

url = f'{BASE_URL}/api/track/challenge/70051238272?hawb=ISR10049167'
req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
    data = json.loads(resp.read().decode())

# dump the full raw response
print(json.dumps(data, indent=2))
