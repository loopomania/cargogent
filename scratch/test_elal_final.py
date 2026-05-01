import sys
import os
sys.path.insert(0, os.path.abspath('AWBTrackers'))
from airlines.elal import ElAlTracker

text = """
Origin 	Destination	Total
Pieces	Weight (Kg)
FRA	TLV	10	330.0
TR 3301	 26 Apr 26 Sun 	A	  26 Apr 26  15:38  	E	  27 Apr 26  15:38  	FRA	LGG	10	330.0	10	330
LY 0822	 28 Apr 26 Tue 	A	  28 Apr 26  10:18  	A	  28 Apr 26  15:35  	LGG	TLV	10	330.0	10	330
LY 0810	 23 Apr 26 Thu 	E	  23 Apr 26  09:35  	E	  23 Apr 26  14:35  	FRA	TLV	10	330.0	0	0
TR 3301	 26 Apr 26 Sun 	A	  26 Apr 26  15:38  	E	  27 Apr 26  15:38  	FRA	LGG	10	330.0	10	330	 	 
PMC 60065 LY	10
LY 0822	 28 Apr 26 Tue 	A	  28 Apr 26  10:18  	A	  28 Apr 26  15:35  	LGG	TLV	10	330.0	10	330	 	 
PMC 60065 LY	10
LY 0810	 23 Apr 26 Thu 	E	  23 Apr 26  09:35  	E	  23 Apr 26  14:35  	FRA	TLV	10	330.0	0	0	 	 
RCS	FRA	20 Apr 26  14:28	10	330.0	 		SACO AIR GMBH
DIS	FRA	23 Apr 26  17:41	10	330.0	LY 0810		
DIS	FRA	24 Apr 26  20:18	10	330.0	LY 0810		
DIS	FRA	25 Apr 26  16:04	10	330.0	TR 3003		
RCF	LGG	27 Apr 26  12:15	10	330.0	TR 3301		
DEP	LGG	28 Apr 26  10:28	10	330.0	LY 822		
"""

tracker = ElAlTracker()
events = tracker._parse_legacy_text(text)
res = tracker._finalize_response("114-23202535", events, [])

print("Final Events:")
for ev in res.events:
    print(f"[{ev.date}] {ev.status_code} at {ev.location} | Flt: {ev.flight} | Pcs: {ev.pieces} | Status: {ev.status}")
