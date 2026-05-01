import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath('AWBTrackers'))
from airlines.elal import ElAlTracker

from dotenv import load_dotenv
load_dotenv('.env-prod')

async def main():
    # Pass the actual WS URL manually
    ws_url = os.getenv('BRIGHTDATA_WS')
    tracker = ElAlTracker(ws_url=ws_url)
    res = await tracker.track("114", "23202535")
    print(f"Message: {res.message}")
    for ev in res.events:
        print(f"[{ev.date}] {ev.status_code} at {ev.location} | Flt: {ev.flight} | Pcs: {ev.pieces}")

asyncio.run(main())
