import requests

def test_brightdata_web_unlocker():
    api_key = "50a1cdf8-f38d-4349-91b0-ac0337f5708b"
    # Testing the El Al tracking URL
    target_url = "https://www.elalextra.net/info/awb.asp?aid=114&awb=63889490&Lang=Eng"
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "zone": "web_unlocker1",
        "url": target_url,
        "format": "raw"
    }
    
    print(f"Sending Web Unlocker API request to {target_url}...")
    try:
        # Bright Data Web Unlocker API takes up to 60s
        res = requests.post("https://api.brightdata.com/request", headers=headers, json=payload, timeout=90)
        print(f"Status Code: {res.status_code}")
        
        text = res.text
        print(f"Response Length: {len(text)}")
        
        if "Air Waybill" in text and "114" in text:
            print("✅ SUCCESS! Bright Data Web Unlocker bypassed Akamai!")
        elif "Access Denied" in text:
            print("❌ BLOCKED BY AKAMAI (Access Denied)")
        elif "kramericaindustries" in text:
            print("❌ RETURNED RAW JAVASCRIPT PAYLOAD (Did not unblock JS)")
        else:
            print("⚠️ UNKNOWN RESULT")
            print(text[:300])
            
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    test_brightdata_web_unlocker()
