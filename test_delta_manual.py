import asyncio
from airlines.delta import DeltaTracker

async def main():
    tracker = DeltaTracker()
    print("Testing Delta Tracker on 006-38686476...")
    result = await tracker.track("006-38686476")
    
    print("\nResult:")
    print(f"Status: {result.status}")
    print(f"Origin: {result.origin}")
    print(f"Destination: {result.destination}")
    print(f"Flight: {result.flight}")
    print(f"Message: {result.message}")
    print(f"Blocked: {result.blocked}")
    print(f"Trace: {result.raw_meta.get('trace', [])}")
    
    print("\nEvents:")
    for e in result.events:
        print(f" - [{e.date}] [{e.status_code}] [{e.location}] {e.description} (Flight: {e.flight})")
            
if __name__ == "__main__":
    asyncio.run(main())
