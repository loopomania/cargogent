import urllib.request, json, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE = 'https://cargogent.com'
req = urllib.request.Request(f'{BASE}/api/auth/login',
    data=json.dumps({'email':'alon@cargogent.com','password':'!A2sQWxz!ZX@'}).encode(),
    headers={'Content-Type':'application/json'})
token = json.loads(urllib.request.urlopen(req, context=ctx).read()).get('token')

url = f'{BASE}/api/track/challenge/70051238272?hawb=ISR10049167'
req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
data = json.loads(urllib.request.urlopen(req, timeout=90, context=ctx).read())

for ev in data.get('events', []):
    src = ev.get('source','?')
    sc = ev.get('status_code','?')
    rmk = str(ev.get('remarks',''))
    customs = str(ev.get('customs',''))
    print(f"source={src} code={sc} customs={repr(customs)} remarks={repr(rmk[:80])}")
