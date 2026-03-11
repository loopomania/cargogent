from curl_cffi import requests

try:
    url = "https://www.elalextra.net/EWB/AIR2.aspx"
    r = requests.get(url, impersonate="chrome124", timeout=15)
    print("Status:", r.status_code)
    if "kramericaindustries" in r.text.lower():
        print("Anti-bot hit.")
    else:
        print("Success! len:", len(r.text))
        
    url_track_trace = "https://www.track-trace.com/aircargo"
    payload = {"number": "114-63866703", "config": "205200", "commit": "Track with options"}
    tt = requests.post(url_track_trace, data=payload, impersonate="chrome124")
    print("tt:", tt.status_code)
    if "Origin" in tt.text:
        print("tt origin found")
except Exception as e:
    print("Error:", e)
