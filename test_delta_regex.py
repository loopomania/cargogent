from airlines.delta import DeltaTracker

text = """
03/12/2026 1430 Departed from ATL on flight DL0235
03/12/2026 1015 Received at ATL
03/11/2026 1900 Booked for JFK
"""

tracker = DeltaTracker()
events = tracker._extract_events_from_text(text)

print("Parsed Events:")
for e in events:
    print(f"Status: {e.status_code}, Date: {e.date}, Loc: {e.location}, Flight: {e.flight}, Desc: {getattr(e, 'remarks', None)}")
