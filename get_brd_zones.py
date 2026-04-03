import requests

def get_zones():
    api_key = "50a1cdf8-f38d-4349-91b0-ac0337f5708b"
    headers = {
        "Authorization": f"Bearer {api_key}"
    }
    
    print("Fetching BrightData Zones...")
    try:
        # Standard API to get zones
        res = requests.get("https://api.brightdata.com/zone", headers=headers)
        print("Status:", res.status_code)
        print("Zones:", res.text)
        
        # Get account info
        res2 = requests.get("https://api.brightdata.com/customer", headers=headers)
        print("Customer:", res2.text)
        
        # Get active proxy passwords
        for z in res.json():
            zone = z.get('name')
            res_pwd = requests.get(f"https://api.brightdata.com/zone/passwords?zone={zone}", headers=headers)
            print(f"Zone {zone} Passwords:", res_pwd.text)
            
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    get_zones()
