import requests
import json
import time

awbs_to_test = ["114-63866703"]

print("====================================")
print("Testing El Al Cargo API via Docker")
print("====================================")

for awb in awbs_to_test:
    print(f"\n[*] Querying AWB: {awb}")
    print("[*] (This may take up to 45 seconds as the headless browser solves the JavaScript challenge...)")
    start_time = time.time()
    
    try:
        response = requests.get(f"http://localhost:8000/track/{awb.replace('-', '')}", timeout=60)
        elapsed = time.time() - start_time
        print(f"[*] Response received in {elapsed:.1f} seconds (Status {response.status_code})")
        
        try:
            data = response.json()
            print("\n[+] JSON Response:")
            print(json.dumps(data, indent=2))
        except Exception:
            print("\n[-] Invalid JSON in response:")
            print(response.text)
            
    except requests.exceptions.RequestException as e:
        print(f"\n[-] Request failed: {e}")
