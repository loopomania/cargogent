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

print("origin:", data.get('origin'))
print("destination:", data.get('destination'))
print()
for i, ev in enumerate(data.get('events', [])):
    print(f"[{i}] status_code={ev.get('status_code')} status={ev.get('status')}")
    print(f"     location={ev.get('location')} date={ev.get('date')}")
    print(f"     flight={ev.get('flight')} source={ev.get('source')}")
    print(f"     departure_date={ev.get('departure_date')} arrival_date={ev.get('arrival_date')}")
    print(f"     pieces={ev.get('pieces')} weight={ev.get('weight')}")
    print(f"     remarks={repr(ev.get('remarks',''))}")
    print()
