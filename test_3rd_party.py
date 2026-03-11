import requests

awb = "114-63866703"

# Let's try some open API endpoints that might not have auth
urls = [
    f"https://api.trackcargo.co/tracking?awb={awb}",
    f"https://www.cargoserv.com/tracking.asp?awb={awb}",
    f"https://api.copilot.cargo.one/tracking/LY/{awb}",
    f"https://api.copilot.cargo.one/tracking/{awb}"
]

for url in urls:
    try:
        r = requests.get(url, timeout=5)
        print(url, r.status_code)
    except Exception as e:
        print(url, "Error")
