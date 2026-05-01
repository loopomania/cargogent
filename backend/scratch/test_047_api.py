import requests
import json

api_url = "https://www.tapcargo.com/api/cargo/cargo-flight-list?functionName=retrieveCargoETracking"
payload = {"AirwayBillNumber": "04734553794"}
headers = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

try:
    res = requests.post(api_url, json=payload, headers=headers)
    print(res.status_code)
    try:
        data = res.json()
        print(json.dumps(data, indent=2))
    except:
        print(res.text[:500])
except Exception as e:
    print(e)
