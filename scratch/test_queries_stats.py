import pandas as pd
import urllib.request
import re
import asyncio

def parse_hawb(hawb):
    if not hawb: return None, None
    m = re.match(r"^([a-zA-Z]+)(\d+)$", hawb.strip())
    if m: return m.group(1).upper(), m.group(2)
    digits = "".join(c for c in hawb if c.isdigit())
    if len(digits) >= 11: return digits[:3], digits[3:11]
    elif len(digits) > 7: return "ISR", digits[-8:]
    return None, None

def check_maman(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        html = urllib.request.urlopen(req, timeout=10).read().decode()
        if 'value("awbStatusResultViewModel"' in html or 'value("headerViewModel"' in html:
            if '[]' not in html.split('value("awbStatusResultViewModel",')[1].split(');')[0]:
                return True
        return False
    except:
        return False

def test_maman(dir_type, mawb, hawb):
    m_pref, m_short = parse_hawb(mawb)
    h_pref, h_short = parse_hawb(hawb)
    digits_m = "".join(c for c in mawb if c.isdigit())
    
    urls = []
    inner_hawb = hawb.strip() if hawb else ""
    
    if h_pref and h_short:
        urls.append(("Both MAWB and HAWB were used unchanged", f"https://mamanonline.maman.co.il/Public/{dir_type}/awbstatus?handler=Search&SHTAR_MITAN_ID_SHORT={h_short}&SHTAR_MITAN_ID_PREF={h_pref}"))
        
    if m_pref and m_short:
        urls.append(("Only MAWB was used", f"https://mamanonline.maman.co.il/Public/{dir_type}/awbstatus?handler=Search&SHTAR_MITAN_ID_SHORT={m_short}&SHTAR_MITAN_ID_PREF={m_pref}"))
        
    if inner_hawb and len(inner_hawb) > 3:
        n_pref, n_short = parse_hawb(inner_hawb[3:])
        if n_pref and n_short:
            urls.append(("Both MAWB and HAWB prefix removed", f"https://mamanonline.maman.co.il/Public/{dir_type}/awbstatus?handler=Search&SHTAR_MITAN_ID_SHORT={n_short}&SHTAR_MITAN_ID_PREF={n_pref}"))

    urls.append(("MAWB was used also in HAWB", f"https://mamanonline.maman.co.il/Public/{dir_type}/awbstatus?handler=Search&SHTAR_MITAN_ID_SHORT={digits_m[3:]}&SHTAR_MITAN_ID_PREF={digits_m[:3]}"))
        
    res = []
    for name, u in urls:
        if check_maman(u):
            res.append(name)
    return res

def test_swissport(dir_type, mawb, hawb):
    endpoint = "SearchBeforeExp" if dir_type == "export" else "SearchBeforeImp"
    digits = "".join(c for c in mawb if c.isdigit())
    pref = digits[:3]
    short = digits[3:]
    
    vars_to_test = []
    inner_hawb = hawb.strip() if hawb else ""
    
    vars_to_test.append(("Both MAWB and HAWB were used unchanged", inner_hawb))
    vars_to_test.append(("Only MAWB was used", ""))
    vars_to_test.append(("Both MAWB and HAWB prefix removed", inner_hawb[3:] if len(inner_hawb)>3 else inner_hawb))
    vars_to_test.append(("MAWB was used also in HAWB", digits))
    
    res = []
    for v_name, inner in vars_to_test:
        payload = f"{{ShtarPre:'{pref}',Shtar:'{short}',Inner:'{inner}', Page:1,Sort:0,Dir:'asc',srtp:0,stype:'2',tisa:'',status:'',date1:'',date2:'',lg:0}}"
        req = urllib.request.Request(f"https://www.swissport.co.il/json/ajax.aspx/{endpoint}", data=payload.encode(), headers={
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": "Mozilla/5.0"
        }, method="POST")
        try:
            raw = urllib.request.urlopen(req, timeout=10).read().decode()
            if '"d":""' not in raw and '"d":"-1"' not in raw:
                res.append(v_name)
        except Exception as e:
            pass
    return res

async def run():
    df2 = pd.read_excel('AWBS/L2077 - Air Import T_020260406075502006649615944906.xlsx', skiprows=3)
    chal_rows = df2[df2['Unnamed: 7'].astype(str).str.contains('700', na=False)]
    
    # LIMIT TO 30 ROWS TO NOT TAKE FOREVER
    chal_rows = chal_rows.head(10)
    print(f"Testing Challenge (700) AWBs (n={len(chal_rows)})")
    
    stats = {}
    multiple_working = 0
    total_found_something = 0
    
    def log_stat(ground, direction, query_name, mawb, hawb):
        key = (ground, direction, query_name)
        if key not in stats:
            stats[key] = {"count": 0, "example": f"MAWB: {mawb}, HAWB: {hawb}"}
        stats[key]["count"] += 1

    for idx, row in chal_rows.iterrows():
        mawb = str(row['Unnamed: 7']).split('.')[0] + str(row['Unnamed: 11'])
        hawb = str(row['Unnamed: 12'])
        if hawb == 'nan': hawb = ""
        
        m_imp = test_maman("import", mawb, hawb)
        m_exp = test_maman("export", mawb, hawb)
        s_imp = test_swissport("import", mawb, hawb)
        s_exp = test_swissport("export", mawb, hawb)
        
        # Check if multiple queries worked for this MAWB across any tracker
        total_worked = len(m_imp) + len(m_exp) + len(s_imp) + len(s_exp)
        if total_worked > 0:
            total_found_something += 1
        if total_worked > 1:
            multiple_working += 1
            
        for q in m_imp: log_stat("Maman", "Import", q, mawb, hawb)
        for q in m_exp: log_stat("Maman", "Export", q, mawb, hawb)
        for q in s_imp: log_stat("Swissport", "Import", q, mawb, hawb)
        for q in s_exp: log_stat("Swissport", "Export", q, mawb, hawb)

    print("\nSTATISTICS:")
    for key, data in stats.items():
        print(f"{key[0]} | {key[1]} | {key[2]} -> Count: {data['count']}, Example: {data['example']}")
        
    print(f"\nNumber of MAWBs that returned data: {total_found_something} out of {len(chal_rows)}")
    print(f"Number of MAWBs where MORE than one query type worked: {multiple_working} out of {len(chal_rows)}")

if __name__ == "__main__":
    asyncio.run(run())
