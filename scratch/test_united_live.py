import sys
import os
import json
import asyncio
from curl_cffi import requests as cffi_requests
import re

awb = "016-92075631"
resp = cffi_requests.get(
    f"https://www.unitedcargo.com/en/us/track/awb/{awb}",
    impersonate="chrome131",
    timeout=30,
    allow_redirects=True,
)
html = resp.text
match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.DOTALL)
if match:
    data = json.loads(match.group(1))
    tracking = data.get("props", {}).get("pageProps", {}).get("api", {}).get("tracking", [])
    if tracking:
        mcd = tracking[0].get("master_consignment_dtl", {})
        print("Total Pieces:", mcd.get("pieces"))
        for group in tracking[0].get("sortedMovementList", []):
            for m in group.get("movements", []):
                if m.get("sts_code") == "DLV":
                    print("DLV Event Pieces:", m.get("pieces"), m.get("sts_date_time_local"))
else:
    print("No next data found")
