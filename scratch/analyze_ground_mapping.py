import urllib.request
import urllib.error
import re
import json
import pandas as pd
from openpyxl import load_workbook
import asyncio

IMPORT_FILE = "awbs/L2077 - Air Import T_020260406075502006649615944906.xlsx"
EXPORT_FILE = "awbs/IL1 Shipment Profile Report Tuesday, 31 March 2026 15_30_14.xlsx"

PREFIX_TO_AIRLINE = {
    "114": "El Al", "020": "Lufthansa", "006": "Delta", "057": "Air France", 
    "074": "KLM", "016": "United", "160": "Cathay", "071": "Ethiopian", 
    "700": "Challenge", "752": "Challenge", "014": "Air Canada", 
    "079": "PAL Cargo", "501": "Silk Way", "281": "CargoBooking", 
    "615": "DHL", "082": "Brussels Airlines", "236": "British Airways", "000": "Unknown"
}

def split_hawb(hawb):
    if not hawb or str(hawb) == "nan": return "", ""
    hawb = str(hawb).strip()
    m = re.match(r"^([A-Za-z]+)(\d+)$", hawb)
    if m: return m.group(1), m.group(2)
    digits = "".join(c for c in hawb if c.isdigit())
    if len(digits) > 7: return "ISR", digits[-8:]
    return "", hawb

def query_maman(short, prefix, dir_type):
    url = f"https://mamanonline.maman.co.il/Public/{dir_type.lower()}/awbstatus?handler=Search&SHTAR_MITAN_ID_SHORT={short}&SHTAR_MITAN_ID_PREF={prefix}"
    req = urllib.request.Request(url, headers={ "User-Agent": "Mozilla/5.0", "Accept": "text/html,application/xhtml+xml,application/xml" })
    try:
        html = urllib.request.urlopen(req, timeout=10).read().decode("utf-8")
        
        m_head = re.search(r'value\("headerViewModel",\s*(\{.*?\})\);', html)
        if m_head:
            try:
                data = json.loads(m_head.group(1))
                if data.get("WGT_TOTAL") is not None or data.get("QTY_TOTAL") is not None:
                    return True
            except: pass
            
        m_res = re.search(r'value\("awbStatusResultViewModel",\s*(\[.*?\])\);', html)
        if m_res:
            try:
                if len(json.loads(m_res.group(1))) > 0: return True
            except: pass

        return False
    except: return False

def query_swissport(prefix, serial, inner, dir_type):
    endpoint = "SearchBeforeExp" if dir_type == "export" else "SearchBeforeImp"
    payload = f"{{ShtarPre:'{prefix}',Shtar:'{serial}',Inner:'{inner}',Page:1,Sort:0,Dir:'asc',srtp:0,stype:'2',tisa:'',status:'',date1:'',date2:'',lg:0}}"
    req = urllib.request.Request(f"https://www.swissport.co.il/json/ajax.aspx/{endpoint}", data=payload.encode("utf-8"), headers={ "Content-Type": "application/json; charset=utf-8", "User-Agent": "Mozilla/5.0" }, method="POST")
    try:
        raw = urllib.request.urlopen(req, timeout=10).read().decode("utf-8")
        try: d = json.loads(raw).get("d", "")
        except: d = raw
        if d and d not in ("-1", ""):
            parts = d.split("~")
            if len(parts) >= 3: return True
        return False
    except: return False

def main():
    def get_df(file, hdr_row):
        wb = load_workbook(file, data_only=True)
        data = list(wb.active.values)
        return pd.DataFrame(data[hdr_row+1:], columns=data[hdr_row])

    idf = get_df(IMPORT_FILE, 4)
    edf = get_df(EXPORT_FILE, 13)
    tasks = {}

    for _, r in edf.iterrows():
        mawb, hawb = str(r.get("Master", "")), str(r.get("House Ref", ""))
        p = mawb.replace("-","").strip()
        if len(p) >= 11:
            pr, en = p[:3], p[3:11]
            airline = PREFIX_TO_AIRLINE.get(pr, f"Unknown ({pr})")
            if "Unknown" in airline: continue
            hp, hn = split_hawb(hawb)
            if airline not in tasks: tasks[airline] = []
            if len(tasks[airline]) < 2:
                tasks[airline].append(("Export", pr, en, hawb, hp, hn))

    for _, r in idf.iterrows():
        mawb, hawb = str(r.get("Master BL", "")), str(r.get("Full HAWB", ""))
        p = mawb.replace("-","").strip()
        if len(p) >= 11:
            pr, en = p[:3], p[3:11]
            airline = PREFIX_TO_AIRLINE.get(pr, f"Unknown ({pr})")
            if "Unknown" in airline: continue
            hp, hn = split_hawb(hawb)
            if airline not in tasks: tasks[airline] = []
            
            # Need to separate IMPORT tests because airlines are shared
            import_items = [it for it in tasks[airline] if it[0] == "Import"]
            if len(import_items) < 2:
                tasks[airline].append(("Import", pr, en, hawb, hp, hn))

    res_lines = []
    import time
    print(f"Testing logic over collected samples (wait...)\n")

    for al, items in tasks.items():
        for it in items:
            atype, pr, en, hawb, hp, hn = it
            
            m_res = "No"
            sp_res = "No"

            if atype == "Export":
                if hn and query_maman(hn, hp, "export"): m_res = "Yes(HAWB)"
                elif query_maman(en, pr, "export"): m_res = "Yes(MAWB)"
            else:
                if query_maman(en, pr, "import"): m_res = "Yes(MAWB)"
                elif hn and query_maman(hn, hp, "import"): m_res = "Yes(HAWB)"

            if query_swissport(pr, en, hawb, atype.lower()):
                sp_res = "Yes"

            res_lines.append(f"{al[:14]:14} | {atype:6} | {pr}-{en:8} | {str(hawb)[:14]:14} | {m_res:10} | {sp_res:5}")
            
    print("Airline        | Type   | MAWB         | HAWB           | Maman      | Swissport")
    print("-" * 86)
    for l in res_lines: print(l)

main()
