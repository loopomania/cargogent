import requests

try:
    print("Testing local API...")
    r = requests.get("http://localhost:8000/track/11463866703")
    print(r.json())
except Exception as e:
    print("Error:", e)
