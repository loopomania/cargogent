import asyncio
import pandas as pd
import sys
import os

# add AWBTrackers to path
sys.path.append(os.path.abspath('AWBTrackers'))
from airlines.maman import MamanExportTracker
from airlines.swissport import SwissportExportTracker
import urllib.request
from typing import Tuple

async def query_maman_import(hawb: str, mawb: str = None) -> Tuple[bool, str]:
    # Custom Maman import query
    tracker = MamanExportTracker()
    prefix, short = tracker._parse_hawb(hawb)
    if not prefix or not short:
        return False, "Invalid HAWB format"
    url = f"https://mamanonline.maman.co.il/Public/import/awbstatus?handler=Search&SHTAR_MITAN_ID_SHORT={short}&SHTAR_MITAN_ID_PREF={prefix}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        html = urllib.request.urlopen(req, timeout=15).read().decode()
        if "value(\"awbStatusResultViewModel\"" in html or "value(\"headerViewModel\"" in html:
            return True, "Success"
        return False, "Not found"
    except Exception as e:
        return False, str(e)

async def test_all():
    # Load some CHALLENGE (700) AWBs
    df2 = pd.read_excel('AWBS/L2077 - Air Import T_020260406075502006649615944906.xlsx', skiprows=3)
    chal_rows = df2[df2['Unnamed: 7'].astype(str).str.contains('700', na=False)]
    print(f"Found {len(chal_rows)} CHALLENGE AWBs in L2077")
    
    samples = []
    for _, row in chal_rows.head(2).iterrows():
        mawb = str(row['Unnamed: 7']) + str(row['Unnamed: 11'])
        hawb = str(row['Unnamed: 12'])
        samples.append({"mawb": mawb, "hawb": hawb, "type": "Import"})
        
    maman_tracker = MamanExportTracker()
    swiss_tracker = SwissportExportTracker()
    
    results = []
    
    for s in samples:
        mawb = s["mawb"]
        hawb = s["hawb"]
        print(f"Testing {s['type']} MAWB:{mawb} HAWB:{hawb}")
        
        variations = [
            ("both MAWB and HAWB unchanged", hawb, mawb),
            ("Only MAWB was used", mawb, mawb),
            ("both MAWB and HAWB prefix removed", hawb[3:] if len(hawb)>3 else hawb, mawb[3:] if len(mawb)>3 else mawb),
            ("MAWB was used also in HAWB", mawb, mawb) # same as only mawb?
        ]
        
        for v_name, v_hawb, v_mawb in variations:
            if not v_hawb: continue
            
            # test maman import
            m_res, _ = await query_maman_import(v_hawb, v_mawb)
            if m_res:
                results.append({"ground": "Maman", "dir": s["type"], "query": v_name})
            
            # test swissport export just in case
            w, p, evs = await swiss_tracker.track_export(v_mawb, v_hawb)
            if evs:
                 results.append({"ground": "Swissport", "dir": s["type"], "query": v_name})
                 
    print("RESULTS:")
    for r in results:
        print(r)

if __name__ == "__main__":
    asyncio.run(test_all())
