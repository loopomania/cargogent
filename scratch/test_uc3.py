import asyncio
from airlines.united import UnitedTracker

async def main():
    tracker = UnitedTracker()
    res = await tracker.track("016", "92075664")
    print(f"Message: {res.message}")
    print(f"Blocked: {res.blocked}")

asyncio.run(main())
