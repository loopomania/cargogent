from curl_cffi import requests

url = "https://www.elalextra.net/EWB/AIR2.aspx?AWBPrefix=114&AWBNum=63866703"

headers = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1"
}

try:
    r = requests.get(url, headers=headers, impersonate="chrome124", timeout=15)
    print("Status:", r.status_code)
    if "kramericaindustries" in r.text.lower():
        print("Anti-bot hit.")
    else:
        print("Success! len:", len(r.text))
        print("Title or AWB check:", "63866703" in r.text)
except Exception as e:
    print("Error:", e)
