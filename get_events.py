import asyncio
import json
import sys
sys.path.append("./AWBTrackers")
from router import route_track

async def main():
    res = await route_track("cathay", "16083499360", "ISR10051862")
    try:
        data = res.model_dump()
        print(json.dumps(data["events"], indent=2))
    except Exception as e:
        print(f"Error: {e}")

asyncio.run(main())
