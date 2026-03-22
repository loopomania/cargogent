import asyncio
import os
import sys

# Change working directory to AWBTrackers and add to sys.path
os.chdir(os.path.join(os.getcwd(), 'AWBTrackers'))
sys.path.append(os.getcwd())

from airlines.elal import ElAlTracker
from router import PROXY_URL

async def test_awb(awb):
    print(f"[*] Testing {awb} with proxy {PROXY_URL}")
    tracker = ElAlTracker(proxy=PROXY_URL)
    res = await tracker.track(awb)
    print("Status:", res.status)
    print("Blocked:", res.blocked)
    print("Message:", res.message)
    print("Events count:", len(res.events))
    print("Trace:", res.raw_meta.get("trace"))
    print("Events:", res.events)

if __name__ == "__main__":
    asyncio.run(test_awb('11463888580'))
