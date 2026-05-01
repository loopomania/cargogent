import re
def normalize_iata_location(loc):
    if not loc or not loc.strip(): return loc
    loc = loc.strip()
    m = re.search(r'\(([A-Z]{3})\)', loc)
    if m: return m.group(1)
    m = re.match(r'^([A-Z]{3})\s*\(', loc)
    if m: return m.group(1)
    if len(loc) == 5 and loc.isalpha() and loc.isupper(): return loc[2:]
    return loc

print(normalize_iata_location("ATH(ARR)"))
print(normalize_iata_location("ATH(DEP)"))
