import asyncio
import os
import sys

# Ensure module path is correct
sys.path.append(os.path.join(os.path.dirname(__file__), "AWBTrackers"))

from AWBTrackers.airlines.aircanada import AirCanadaTracker
from AWBTrackers.airlines.delta import DeltaTracker

async def main():
    proxy = "wss://brd-customer-hl_e9a94126-zone-scraping_browser1scraping_brow:k91t6m9kw0x1@brd.superproxy.io:9222"
    
    # Test Air Canada
    print("\n--- Testing Air Canada (014-37614662) ---")
    ac_tracker = AirCanadaTracker(proxy=proxy)
    res_ac = await ac_tracker.track("014-37614662")
    print("Success:", res_ac.message == "Successfully loaded tracking data." or res_ac.message == "Success")
    print("Blocked:", res_ac.blocked)
    print("Message:", res_ac.message)
    print("Events:", len(res_ac.events))
    
    # We want to just see what the text was
    print("Air Canada returned length:", res_ac.raw_meta.get("trace"))
        
    # Test Delta
    print("\n--- Testing Delta (006-30929404) ---")
    dl_tracker = DeltaTracker(proxy=proxy)
    res_dl = await dl_tracker.track("006-30929404")
    print("Success:", res_dl.message == "Successfully loaded tracking data." or res_dl.message == "Success")
    print("Blocked:", res_dl.blocked)
    print("Message:", res_dl.message)
    print("Events:", len(res_dl.events))
    if len(res_dl.events) > 0:
        print("Latest Event:", res_dl.events[-1].location, res_dl.events[-1].status_code)
        
    print("Trace AC:", res_ac.raw_meta.get("trace"))
    print("Trace DL:", res_dl.raw_meta.get("trace"))
        
    print("\nTests complete")

if __name__ == '__main__':
    asyncio.run(main())
