import urllib.request
import urllib.parse
import json
import ssl

# Server forces HTTPS redirect; use HTTPS with unverified cert (self-signed on IP)
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE_URL = 'https://cargogent.com'
login_data = json.dumps({'email': 'alon@cargogent.com', 'password': '!A2sQWxz!ZX@'}).encode('utf-8')
req = urllib.request.Request(f'{BASE_URL}/api/auth/login', data=login_data, headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req, context=ctx) as resp:
        token = json.loads(resp.read().decode()).get('token')
    print('Login OK')

    url = f'{BASE_URL}/api/track/challenge/70051238272?hawb=ISR10049167'
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
        data = json.loads(resp.read().decode())

    print('Status:', data.get('status'))
    print('Message:', data.get('message'))
    print('Events count:', len(data.get('events', [])))
    for i, ev in enumerate(data.get('events', [])):
        status = ev.get('status') or ev.get('status_code') or '?'
        loc = ev.get('location') or '?'
        pieces = ev.get('pieces') or 'N/A'
        weight = ev.get('weight') or 'N/A'
        date = ev.get('date') or '?'
        remarks = ev.get('remarks') or ''
        print(f"  [{i+1}] {date} | {loc} | {status} | pieces={pieces} weight={weight}")
        if remarks:
            print(f"      remarks: {remarks}")

except Exception as e:
    print('Error:', e)
    if hasattr(e, 'read'):
        print(e.read().decode())
