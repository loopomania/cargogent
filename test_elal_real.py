
import asyncio
import sys
import os

# Add AWBTrackers to path
sys.path.append(os.path.join(os.getcwd(), "AWBTrackers"))

from AWBTrackers.airlines.elal import ElAlTracker
from AWBTrackers.router import PROXY_URL

async def test_elal(awb):
    print(f"[*] Testing El Al with AWB: {awb}")
    tracker = ElAlTracker(proxy=PROXY_URL)
    result = await tracker.track(awb)
    import json
    print(f"[+] Result for {awb}:")
    # Convert result to dict for printing
    print(json.dumps({
        "awb": result.awb,
        "origin": result.origin,
        "destination": result.destination,
        "status": result.status,
        "events_count": len(result.events),
        "message": result.message,
        "blocked": result.blocked,
        "trace": result.raw_meta.get("trace")
    }, indent=2))

if __name__ == "__main__":
    awb1 = "01437623036"
    awb2 = "11437623036"
    
    asyncio.run(test_elal(awb1))
    print("-" * 40)
    asyncio.run(test_elal(awb2))
