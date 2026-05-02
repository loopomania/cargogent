import asyncio
from AWBTrackers.airlines.thai import ThaiTracker

async def test():
    tracker = ThaiTracker(proxy="ws://168.119.228.149:3000/browser/scrape")
    res = await tracker.track("217-07891354")
    print(res.message)
    print(res.events)
    print(res.raw_meta)

asyncio.run(test())
