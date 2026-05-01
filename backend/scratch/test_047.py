import asyncio
import os
import sys

sys.path.append("/Users/alonmarom/dev/cargogent/AWBTrackers")

from router import route_track

async def main():
    res = await route_track("047", "04734553794", "ISR10056051")
    print(res.json(indent=2))

if __name__ == "__main__":
    asyncio.run(main())
