from curl_cffi import requests
from bs4 import BeautifulSoup

def test_delta_cffi():
    # Attempting to fetch Delta Cargo API directly with curl_cffi chrome impersonation
    url = "https://www.deltacargo.com/Cargo/data/shipment/trackAwb"
    print(f"Testing curl_cffi tracking on {url}...")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.5",
        "Content-Type": "application/json",
        "Connection": "keep-alive"
    }
    
    payload = {"AwbNumber": "006-38686476"}
    
    try:
        r = requests.post(url, json=payload, impersonate="chrome120", headers=headers, timeout=15)
        print(f"Status: {r.status_code}")
        
        with open("delta_cffi_result.json", "w") as f:
            f.write(r.text)
        print("Saved to delta_cffi_result.json")
        
        if "Access Denied" in r.text or "edgesuite.net" in r.text.lower():
            print("Blocked by Akamai!")
        else:
            print("Successfully loaded the API endpoint without Akamai blocking!")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_delta_cffi()
