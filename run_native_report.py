import asyncio
import time
import os
import sys

# Append path to import correct modules
sys.path.append(os.path.join(os.path.dirname(__file__), "AWBTrackers"))

from AWBTrackers.router import route_track

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

async def main():
    markdown_report = "# Production Tracker NATIVE Run Report\n\n"
    markdown_report += "This test executes tracking algorithms directly bypassing API routing latency.\n\n"
    markdown_report += "| Airline | AWB | Status | Duration (s) | Events Parsed | Notes |\n"
    markdown_report += "| :--- | :--- | :--- | :--- | :--- | :--- |\n"
    
    for airline, awb in trackers:
        print(f"Testing {airline} ({awb})...")
        start_time = time.time()
        
        try:
            res = await route_track(airline, awb)
            duration = time.time() - start_time
            duration_str = f"{duration:.2f}"
            
            if res.blocked:
                status = "🔴 BLOCKED"
                notes = res.message
                event_count = 0
            elif len(res.events) > 0 or res.message == "Success" or res.message == "Successfully loaded tracking data.":
                status = "🟢 SUCCESS"
                notes = res.message
                event_count = len(res.events)
            else:
                status = "🟡 NO EVENTS / ERROR"
                notes = res.message
                event_count = len(res.events)
                
        except Exception as e:
            duration = time.time() - start_time
            duration_str = f"{duration:.2f}"
            status = "🔴 FATAL EXCEPTION"
            notes = str(e)[:35]
            event_count = 0
            
        # Clean up notes for markdown tables
        notes = str(notes).replace('\n', ' ').replace('|', '-')
        
        markdown_report += f"| {airline} | {awb} | {status} | {duration_str} | {event_count} | {notes} |\n"
        
    with open("/tmp/tracking_report.md", "w") as f:
        f.write(markdown_report)
    print("FINISHED")

if __name__ == '__main__':
    asyncio.run(main())
