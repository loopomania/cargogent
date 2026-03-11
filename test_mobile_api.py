import requests

awb = "114-63866703"
headers = {
    'User-Agent': 'ELAL%20Cargo%20Tracker/1.2 CFNetwork/1408.0.4 Darwin/22.5.0',
    'Accept': '*/* ',
    'Accept-Language': 'en-us',
}

urls = [
    f"https://www.elalextra.net/EWB/AIR2.aspx?AWBPrefix=114&AWBNum=63866703"
]

for url in urls:
    try:
        r = requests.get(url, headers=headers, timeout=10)
        print("Status", r.status_code)
        if "kramer" in r.text.lower():
            print("Blocked.")
        elif "63866703" in r.text:
            print("FOUND")
    except Exception as e:
        print(f"Err {e}")
