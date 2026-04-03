import requests
import time

trackers = [
    ("Delta", "006-30929404"),
    ("Air Canada", "014-37614662"),
    ("United", "016-09641925"),
    ("Lufthansa", "020-00958171"),
    ("AFKLM", "057-00627163"),
    ("Ethiopian", "071-59724151"),
    ("CargoPal", "079-50741353"),
    ("El Al", "114-21805243"),
    ("Cathay Pacific", "160-03078526"),
    ("CargoBooking", "281-24905215"),
    ("Silk Way", "501-19408362"),
    ("DHL Aviation", "615-66486733"),
    ("Challenge (700)", "700-51238180"),
    ("Challenge (752)", "752-50012491")
]

markdown_report = "# Production Tracker Internal API Report\n\n"
markdown_report += "This test executes tracking requests entirely within the Production Hetzner Docker Container against `localhost:8000`.\n\n"
markdown_report += "| Airline | AWB | Status | Duration (s) | Events Parsed | Notes |\n"
markdown_report += "| :--- | :--- | :--- | :--- | :--- | :--- |\n"

for airline, awb in trackers:
    print(f"Testing {airline} ({awb})...")
    start_time = time.time()
    
    try:
        res = requests.get(f"http://localhost:8000/track/{awb}", timeout=90)
        duration = time.time() - start_time
        duration_str = f"{duration:.2f}"
        
        if res.status_code == 200:
            data = res.json()
            events = data.get("events", [])
            msg = data.get("message", "")
            blocked = data.get("blocked", False)
            
            if blocked:
                status = "🔴 BLOCKED"
            elif len(events) > 0 or msg in ["Success", "Successfully loaded tracking data."]:
                status = "🟢 SUCCESS"
            else:
                status = "🟡 NO EVENTS / ERROR"
            
            notes = msg
            event_count = len(events)
        else:
            status = f"🔴 HTTP {res.status_code}"
            notes = res.text[:35]
            event_count = 0
            
    except Exception as e:
        duration = time.time() - start_time
        duration_str = f"{duration:.2f}"
        status = "🔴 ERROR"
        notes = str(e)[:35]
        event_count = 0
        
    notes = str(notes).replace('\n', ' ').replace('|', '-')
    markdown_report += f"| {airline} | {awb} | {status} | {duration_str} | {event_count} | {notes} |\n"

with open("/app/prod_report.md", "w") as f:
    f.write(markdown_report)

print("Report saved to /app/prod_report.md")
