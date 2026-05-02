import re

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

pattern2 = r"([A-Z0-9]{2}\s+\d+)\s*[|\t ]+\s*[^|\t\n]+[|\t ]+\s*([A-Z])\s*[|\t ]+(\d{1,2}\s+[A-Za-z]{3}\s+\d{2}\s+\d{2}:\d{2})\s*[|\t ]+\s*([A-Z])\s*[|\t ]+(\d{1,2}\s+[A-Za-z]{3}\s+\d{2}\s+\d{2}:\d{2})\s*[|\t ]+\s*([A-Z]{3})\s*[|\t ]+\s*([A-Z]{3})\s*[|\t ]+\s*(\d+)\s*[|\t ]+\s*([\d.]+)\s*[|\t ]+\s*(\d+)\s*[|\t ]+\s*([\d.]+)"

for m in re.finditer(pattern2, text):
    g = m.groups()
    flight = g[0]
    origin = g[5]
    dest = g[6]
    total_pcs = g[7]
    loaded_pcs = g[9]
    print(f"Flight: {flight} | {origin}->{dest} | Total Pcs: {total_pcs} | Loaded Pcs: {loaded_pcs}")

print("\nEvents:")
event_pattern = r"^([A-Z]{3})\s+([A-Z]{3})\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{2})\s+(\d{2}:\d{2})\s+(\d+)\s+([\d.]+)(.*)$"
for line in text.split('\n'):
    line = line.strip().replace('\xa0', ' ')
    m = re.match(event_pattern, line)
    if m:
        print(f"Event: {m.groups()}")
