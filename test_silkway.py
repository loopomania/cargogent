import asyncio
from AWBTrackers.airlines.silkway import SilkWayTracker
async def test():
    t = SilkWayTracker()
    r = await t.track("501-20089801")
    for e in r.events:
        print(f"{e.date} | {e.status_code} | {e.location} | {e.flight} | {e.remarks}")
asyncio.run(test())
