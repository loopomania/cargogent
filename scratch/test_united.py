import sys
import os
import asyncio
sys.path.append(os.path.join(os.path.dirname(__file__), '../AWBTrackers'))
from airlines.united import UnitedTracker

async def test():
    tracker = UnitedTracker()
    try:
        res = await tracker.track("016-92075841")
        print("RESULT 1:")
        print(res)
    except Exception as e:
        print("ERROR 1:", e)
        
    try:
        res = await tracker.track("016-92075631")
        print("RESULT 2:")
        print(res)
    except Exception as e:
        print("ERROR 2:", e)

asyncio.run(test())
