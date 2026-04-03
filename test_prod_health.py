import requests

# Hardcoded from MAWB_TEST_LIST.md
trackers = [
    ("Delta", "00630929404"),
    ("Air Canada", "01437614662"),
    ("United", "01609641925"),
    ("Lufthansa", "02000958171"),
    ("AFKLM", "05700627163"),
    ("Ethiopian", "07159724151"),
    ("CargoPal", "07950741353"),
    ("El Al", "11421805243"),
    ("Cathay Pacific", "16003078526"),
    ("CargoBooking", "28124905215"),
    ("Silk Way", "50119408362"),
    ("DHL Aviation", "61566486733"),
    ("Challenge (700)", "70051238180"),
    ("Challenge (752)", "75250012491")
]

results = {"WORKING": [], "BLOCKED": [], "FAILED": []}

for airline, awb in trackers:
    print(f"Testing {airline} ({awb})...")
    try:
        headers = {"Authorization": "Bearer supersecret_auth_token_for_awbt_5914"}
        res = requests.get(f"https://cargogent.com/api/track/{awb}", headers=headers, timeout=65)
        if res.status_code == 200:
            data = res.json()
            err = data.get("error", "")
            msg = data.get("message", "")
            blocked = data.get("blocked", False)
            events = data.get("events", [])
            
            if blocked or "akamai" in err.lower() or "bot" in err.lower() or "denied" in err.lower() or "session expired" in err.lower() or "session expired" in msg.lower():
                results["BLOCKED"].append((airline, awb, err or msg))
            elif "not configured" in msg.lower() or "not configured" in err.lower():
                results["FAILED"].append((airline, awb, "Not Configured"))
            elif events or msg == "Success":
                results["WORKING"].append((airline, awb))
            else:
                results["FAILED"].append((airline, awb, err or msg or "No events found"))
        else:
            results["FAILED"].append((airline, awb, f"HTTP {res.status_code}"))
    except Exception as e:
        results["FAILED"].append((airline, awb, str(e)))

print("\n\n--- PRODUCTION HEALTH REPORT ---")
print("✅ WORKING TRACKERS:")
for a, awb in results["WORKING"]:
    print(f"  - {a}")

print("\n⛔ BLOCKED BY WAF/BOT PROTECTION:")
for a, awb, err in results["BLOCKED"]:
    print(f"  - {a} : {err}")

print("\n❌ FAILED OR ERROR:")
for a, awb, err in results["FAILED"]:
    print(f"  - {a} : {err}")
