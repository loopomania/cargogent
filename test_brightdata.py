import requests
import json

def test_brightdata():
    api_key = "50a1cdf8-f38d-4349-91b0-ac0337f5708b"
    target_url = "https://www.elalextra.net/info/awb.asp?aid=114&awb=63889490&Lang=Eng"
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    # Try different endpoints or proxy config
    # 1. Scraping Browser / Request API
    print("Testing BrightData API...")
    url = "https://api.brightdata.com/unblocker/request"
    
    payload = {
        "url": target_url,
        "method": "GET"
    }
    
    try:
        res = requests.post("https://api.brightdata.com/dca/trigger", headers=headers, json={"zone": "web_unlocker1", "url": target_url})
        print(f"Trigger Status: {res.status_code}")
        print("Response:", res.text)
        
        # Another endpoint common in BRD
        res2 = requests.post("https://api.brightdata.com/request", headers=headers, json={"url": target_url, "zone": "web_unlocker"})
        print(f"Request Status: {res2.status_code}")
        print("Response:", res2.text)
    except Exception as e:
        print(e)
        
if __name__ == "__main__":
    test_brightdata()
