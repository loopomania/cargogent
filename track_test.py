import sys
import asyncio
import os
import json
sys.path.insert(0, os.path.abspath("AWBTrackers"))

from router import route_track

async def main():
    res = await route_track("cathay", "16083499360", "ISR10051862")
    try:
        data = res.model_dump()
    except Exception:
        data = res.dict()
    print(json.dumps(data, indent=2))

asyncio.run(main())
