import asyncio
from airlines.united import UnitedTracker
from curl_cffi import requests

async def main():
    resp = requests.get("https://www.unitedcargo.com/en/us/track/awb/016-92075664", impersonate="chrome131")
    tracker = UnitedTracker()
    raw = tracker._extract_from_json(resp.text)
    print("Raw keys:", raw.keys() if raw else "Empty")
    if raw:
        print("sortedMovementList len:", len(raw.get("sortedMovementList", [])))
        print("master_consignment_dtl:", raw.get("master_consignment_dtl"))

asyncio.run(main())
