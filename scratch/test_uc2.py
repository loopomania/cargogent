import asyncio
from airlines.united import UnitedTracker

async def main():
    tracker = UnitedTracker()
    res = await tracker.track("016", "92075664")
    print(f"Total pieces in master: {res.raw_meta['pieces']}")
    print(f"Total weight: {res.raw_meta['weight']}")
    for ev in res.events:
        print(f"[{ev.date}] {ev.status_code} at {ev.location} | Flt: {ev.flight} | Pcs: {ev.pieces}")

asyncio.run(main())
