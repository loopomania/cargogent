import requests
import time
import json
import os

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

results = []
markdown_report = "# Production Airline Tracker Run Report\n\n"
markdown_report += "| Airline | AWB | Status | Duration (s) | Events Parsed | Notes |\n"
markdown_report += "| :--- | :--- | :--- | :--- | :--- | :--- |\n"

for airline, awb in trackers:
    print(f"Testing {airline} ({awb})...")
    start_time = time.time()
    try:
        headers = {"Authorization": "Bearer supersecret_auth_token_for_awbt_5914"}
        res = requests.get(f"https://cargogent.com/api/track/{awb}", headers=headers, timeout=65)
        duration = time.time() - start_time
        duration_str = f"{duration:.2f}"
        
        if res.status_code == 200:
            data = res.json()
            err = data.get("error", "")
            msg = data.get("message", "")
            blocked = data.get("blocked", False)
            events = data.get("events", [])
            
            if blocked or "akamai" in err.lower() or "bot" in err.lower() or "denied" in err.lower() or "session expired" in err.lower():
                status = "🔴 BLOCKED"
                notes = msg or err
                event_count = 0
            elif "not configured" in msg.lower() or "not configured" in err.lower():
                status = "⚪ NOT IMPLEMENTED"
                notes = msg or err
                event_count = 0
            elif events or msg == "Success" or msg == "Successfully loaded tracking data.":
                status = "🟢 SUCCESS"
                notes = msg or "Got Events"
                event_count = len(events)
            else:
                status = "🟡 EMPTY/ERROR"
                notes = msg or err or "No events found"
                event_count = len(events)
        else:
            status = "🔴 HTTP ERROR"
            notes = f"HTTP {res.status_code}"
            event_count = 0
            
    except Exception as e:
        duration = time.time() - start_time
        duration_str = f"{duration:.2f}"
        status = "🔴 EXCEPTION"
        notes = str(e)[:50]
        event_count = 0
        
    markdown_report += f"| {airline} | {awb} | {status} | {duration_str} | {event_count} | {notes} |\n"

with open("/tmp/prod_report.md", "w") as f:
    f.write(markdown_report)

print("Report saved to /tmp/prod_report.md")
