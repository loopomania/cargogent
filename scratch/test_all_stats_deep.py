import pandas as pd
import urllib.request
import re
import asyncio

PREFIX_TO_GROUND = {
    '114': 'Maman', '020': 'Maman', '016': 'Maman', '014': 'Maman', '057': 'Maman',
    '071': 'Maman', '501': 'Maman', '771': 'Maman', '098': 'Maman', '406': 'Maman',
    '023': 'Maman', '607': 'Swissport', '105': 'Swissport', '657': 'Swissport',
    '281': 'Swissport', '999': 'Swissport', '700': 'Both', '085': 'Maman',
    '006': 'Maman', '074': 'Maman', '160': 'Maman', '615': 'Swissport',
}

def get_ground(prefix, carrier_name=None):
    if prefix in PREFIX_TO_GROUND: return PREFIX_TO_GROUND[prefix]
    if carrier_name:
        cn = str(carrier_name).upper()
        if any(x in cn for x in ['DHL','ETIHAD','FINNAIR','TAROM','CHINA','BALTIC']): return 'Swissport'
        if 'CHALLENGE' in cn: return 'Both'
    return 'Maman'

def parse_hawb(hawb):
    if not hawb: return None, None
    hawb = str(hawb).strip()
    if hawb == 'nan': return None, None
    m = re.match(r"^([a-zA-Z]+)(\d+)$", hawb)
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
            if '[]' not in html.split('value("awbStatusResultViewModel",')[1].split(');')[0]: return True
    except: pass
    return False

def test_maman_all(dir_type, mawb, hawb):
    m_pref, m_short = parse_hawb(mawb)
    h_pref, h_short = parse_hawb(hawb)
    digits_m = "".join(c for c in str(mawb) if c.isdigit())
    inner_hawb = str(hawb).strip() if pd.notna(hawb) and str(hawb) != 'nan' else ""
    
    results = []
    
    # 1. Both MAWB + HAWB unchanged
    if h_pref and h_short:
        u = f"https://mamanonline.maman.co.il/Public/{dir_type}/awbstatus?handler=Search&SHTAR_MITAN_ID_SHORT={h_short}&SHTAR_MITAN_ID_PREF={h_pref}"
        if check_maman(u): results.append(("MAWB+HAWB", f"MAWB: {mawb}, HAWB: {hawb}"))
            
    # 2. Only MAWB
    if m_pref and m_short:
        u = f"https://mamanonline.maman.co.il/Public/{dir_type}/awbstatus?handler=Search&SHTAR_MITAN_ID_SHORT={m_short}&SHTAR_MITAN_ID_PREF={m_pref}"
        if check_maman(u): results.append(("Only MAWB", f"MAWB: {mawb}, HAWB: (empty)"))
        
    # 3. MAWB + HAWB prefix 3 letters removed
    if inner_hawb and len(inner_hawb) > 3:
        n_pref, n_short = parse_hawb(inner_hawb[3:])
        if n_pref and n_short:
            u = f"https://mamanonline.maman.co.il/Public/{dir_type}/awbstatus?handler=Search&SHTAR_MITAN_ID_SHORT={n_short}&SHTAR_MITAN_ID_PREF={n_pref}"
            if check_maman(u): results.append(("MAWB+HAWB prefix removed", f"MAWB: {mawb}, HAWB: {inner_hawb[3:]}"))

    # 4. MAWB used also in HAWB param
    if digits_m and len(digits_m) > 3:
        u = f"https://mamanonline.maman.co.il/Public/{dir_type}/awbstatus?handler=Search&SHTAR_MITAN_ID_SHORT={digits_m[3:]}&SHTAR_MITAN_ID_PREF={digits_m[:3]}"
        if check_maman(u): results.append(("MAWB used also in HAWB", f"MAWB: {mawb}, HAWB: {mawb}"))
        
    return results

def test_swissport_all(dir_type, mawb, hawb):
    endpoint = "SearchBeforeExp" if dir_type == "export" else "SearchBeforeImp"
    digits = "".join(c for c in str(mawb) if c.isdigit())
    pref = digits[:3]
    short = digits[3:]
    inner_hawb = str(hawb).strip() if pd.notna(hawb) and str(hawb) != 'nan' else ""
    
    def try_payload(inner):
        p = f"{{ShtarPre:'{pref}',Shtar:'{short}',Inner:'{inner}', Page:1,Sort:0,Dir:'asc',srtp:0,stype:'2',tisa:'',status:'',date1:'',date2:'',lg:0}}"
        req = urllib.request.Request(f"https://www.swissport.co.il/json/ajax.aspx/{endpoint}", data=p.encode(), headers={"Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest", "User-Agent": "Mozilla/5.0"}, method="POST")
        try:
            raw = urllib.request.urlopen(req, timeout=10).read().decode()
            if '"d":""' not in raw and '"d":"-1"' not in raw: return True
        except: pass
        return False

    results = []

    if try_payload(inner_hawb): results.append(("MAWB+HAWB", f"MAWB: {mawb}, HAWB: {inner_hawb}"))
    if try_payload(""): results.append(("Only MAWB", f"MAWB: {mawb}, HAWB: (empty)"))
    if inner_hawb and len(inner_hawb)>3:
        if try_payload(inner_hawb[3:]): results.append(("MAWB+HAWB prefix removed", f"MAWB: {mawb}, HAWB: {inner_hawb[3:]}"))
    if try_payload(digits): results.append(("MAWB used also in HAWB", f"MAWB: {mawb}, HAWB: {digits}"))
    
    return results

async def test_worker(queue, stats):
    while True:
        item = await queue.get()
        mawb, hawb, d_type, g = item['mawb'], item['hawb'], item['query_dir'], item['ground']
        
        try:
            if g in ('Both', 'Maman'):
                res_list = await asyncio.to_thread(test_maman_all, d_type, mawb, hawb)
                for qname, example in res_list:
                    if qname not in stats['Maman'][d_type]:
                        stats['Maman'][d_type][qname] = {"count": 0, "example": example}
                    stats['Maman'][d_type][qname]["count"] += 1
            if g in ('Both', 'Swissport'):
                res_list = await asyncio.to_thread(test_swissport_all, d_type, mawb, hawb)
                for qname, example in res_list:
                    if qname not in stats['Swissport'][d_type]:
                        stats['Swissport'][d_type][qname] = {"count": 0, "example": example}
                    stats['Swissport'][d_type][qname]["count"] += 1
        except Exception:
            pass
        finally:
            queue.task_done()

async def run():
    print("Loading L2077...")
    df_l2077 = pd.read_excel('AWBS/L2077 - Air Import T_020260406075502006649615944906.xlsx', header=None, skiprows=4)
    print("Loading IL1...")
    df_il1 = pd.read_excel('AWBS/IL1 Shipment Profile Report Friday, 10 April 2026 15_23_15.xlsx', header=None, skiprows=13)
    
    unique_keys = set()
    work_items = []
    
    # Just take 300 records from Import and 300 from Export to get robust stats fast
    for _, row in df_l2077.iterrows():
        if pd.isna(row[11]): continue
        pref = str(row[7]).split('.')[0].strip()
        serial = str(row[11]).split('.')[0].strip()
        mawb = pref + serial
        hawb = str(row[12]).strip() if pd.notna(row[12]) else ""
        cname = row[8]
        
        k = (mawb, hawb, "import")
        if k not in unique_keys:
            unique_keys.add(k)
            work_items.append({'mawb': mawb, 'hawb': hawb, 'query_dir': 'import', 'ground': get_ground(pref, cname)})
            if len(work_items) > 500: break

    export_items = 0
    for _, row in df_il1.iterrows():
        if pd.isna(row[8]): continue
        mawb = "".join(c for c in str(row[8]) if c.isdigit())
        if len(mawb) < 11: continue
        hawb = str(row[9]).strip() if pd.notna(row[9]) else ""
        
        o_ctry = str(row[5]).strip()
        d_ctry = str(row[7]).strip()
        
        q_dir = None
        if o_ctry == 'IL': q_dir = 'export'
        elif d_ctry == 'IL': q_dir = 'import'
        if not q_dir: continue
        
        k = (mawb, hawb, q_dir)
        if k not in unique_keys:
            if q_dir == 'export' and export_items > 300: continue
            if q_dir == 'import': continue # already got imports from L2077
            
            unique_keys.add(k)
            work_items.append({'mawb': mawb, 'hawb': hawb, 'query_dir': q_dir, 'ground': get_ground(mawb[:3])})
            if q_dir == 'export': export_items += 1

    print(f"Total unique records sampled: {len(work_items)}")
    
    stats = {'Maman': {'import': {}, 'export': {}}, 'Swissport': {'import': {}, 'export': {}}}

    import time
    t0 = time.time()
    queue = asyncio.Queue()
    for w in work_items: queue.put_nowait(w)
    
    workers = [asyncio.create_task(test_worker(queue, stats)) for _ in range(25)]
    
    while not queue.empty():
        await asyncio.sleep(5)
        rem = queue.qsize()
        done = len(work_items) - rem
        print(f"Processed {done}/{len(work_items)} in {time.time() - t0:.1f}s")
        
    await queue.join()
    for w in workers: w.cancel()
    
    print("\nFINAL ABSOLUTE STATS (NO SHORT CIRCUIT):")
    for g in ['Maman', 'Swissport']:
        for d in ['import', 'export']:
            print(f"--- {g} | {d.upper()} ---")
            for k, v in stats[g][d].items():
                print(f"  {k} -> Successes: {v['count']} | Example: {v['example']}")

if __name__ == "__main__":
    asyncio.run(run())
