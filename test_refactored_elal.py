import asyncio
import os
import sys

# Ensure module path is correct
sys.path.append(os.path.join(os.path.dirname(__file__), "AWBTrackers"))

from AWBTrackers.airlines.elal import ElAlTracker

async def main():
    proxy = "wss://brd-customer-hl_e9a94126-zone-scraping_browser1scraping_brow:k91t6m9kw0x1@brd.superproxy.io:9222"
    tracker = ElAlTracker(proxy=proxy)
    print(f"Tracking 114-63889490 via ElAlTracker module {proxy[:30]}...")
    res = await tracker.track("114-63889490")
    
    print("Airline:", res.airline)
    print("Success:", res.message == "Success")
    print("Blocked:", res.blocked)
    print("Events:", len(res.events))
    if len(res.events) > 0:
        print("Latest Event:", res.events[-1].location, res.events[-1].status)
    print("Trace:", res.raw_meta.get("trace"))

if __name__ == '__main__':
    asyncio.run(main())
