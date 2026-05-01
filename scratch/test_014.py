import asyncio
import sys
import os

sys.path.append(os.path.abspath("../AWBTrackers"))

from router import route_track

async def main():
    res = await route_track("aircanada", "01437625582", "ISR10055923")
    print(f"Origin: {res.origin}")
    print(f"Destination: {res.destination}")
    print(f"Total events: {len(res.events)}")
    for e in res.events:
        print(f"[{e.source}] {e.status_code} at {e.location}")

asyncio.run(main())
