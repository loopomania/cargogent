import asyncio
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), "AWBTrackers"))

from AWBTrackers.airlines.aircanada import AirCanadaTracker

async def main():
    proxy = "wss://brd-customer-hl_e9a94126-zone-scraping_browser1scraping_brow:k91t6m9kw0x1@brd.superproxy.io:9222"
    
    # Test Air Canada
    print("\n--- Testing Air Canada (014-37614662) ---")
    ac_tracker = AirCanadaTracker(proxy=proxy)
    res_ac = await ac_tracker.track("014-37614662")
    
    print("AC trace:", res_ac.raw_meta.get("trace"))

if __name__ == '__main__':
    asyncio.run(main())
