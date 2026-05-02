import asyncio
import os
import sys

# add parent directory to path so we can import AWBTrackers
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from AWBTrackers.airlines.eva import EVATracker

async def main():
    tracker = EVATracker(proxy=None) # let's try without proxy locally first, since my local machine might not be blocked
    res = await tracker.track("695-59552286")
    print(res.json(indent=2))

asyncio.run(main())
