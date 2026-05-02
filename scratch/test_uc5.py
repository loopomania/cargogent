import asyncio
from airlines.united import UnitedTracker
from curl_cffi import requests
import json

async def main():
    resp = requests.get("https://www.unitedcargo.com/en/us/track/awb/016-92075664", impersonate="chrome131")
    tracker = UnitedTracker()
    raw = tracker._extract_from_json(resp.text)
    if raw:
        print(json.dumps(raw.get("sortedMovementList", []), indent=2))

asyncio.run(main())
