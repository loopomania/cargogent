import pandas as pd
import json

file_paths = [
    "awbs/IL1 Shipment Profile Report Monday, 30 March 2026 17_46_43.xlsx",
    "awbs/22 March 2026 15_18_20.xlsx",
    "awbs/IL1 Shipment Profile Report Thursday, 19 March 2026 08_19_52.xlsx",
    "awbs/IL1 DSV Shipment Report (Transport Data) Sunday, 08 February 2026 09_41_32.xlsx",
    "awbs/IL1 DSV Shipment Report (Transport Data) Sunday, 08 February 2026 09_41_43.xlsx",
    "awbs/IL1 Shipment Profile Report Wednesday, 04 March 2026 11_06_55.xlsx",
    "awbs/L2077_-_Air_Import_Tracing 16.03.xlsx"
]

PREFIX_MAP = {
    "114": "El Al",
    "020": "Lufthansa",
    "006": "Delta",
    "057": "AFKLM (Air France)",
    "074": "AFKLM (KLM)",
    "016": "United",
    "160": "Cathay",
    "071": "Ethiopian",
    "700": "Challenge",
    "752": "Challenge",
    "014": "Air Canada",
    "079": "CargoPal",
    "501": "Silk Way",
    "281": "CargoBooking",
    "615": "DHL Aviation"
}

results = {}

for file_path in file_paths:
    try:
        df_raw = pd.read_excel(file_path, header=None)
        
        header_idx = -1
        master_col = None
        house_col = None
        
        for idx, row in df_raw.iterrows():
            row_vals = [str(x) for x in row.values]
            if 'Master' in row_vals and 'House Ref' in row_vals:
                header_idx = idx
                master_col = 'Master'
                house_col = 'House Ref'
                break
            if 'MAWB' in row_vals and 'House AWB' in row_vals:
                header_idx = idx
                master_col = 'MAWB'
                house_col = 'House AWB'
                break
            if 'MAWB' in row_vals and 'HAWB' in row_vals:
                header_idx = idx
                master_col = 'MAWB'
                house_col = 'HAWB'
                break
                
        if header_idx != -1:
            df = pd.read_excel(file_path, header=header_idx)
            for idx, row in df.iterrows():
                mawb_val = row.get(master_col, '')
                hawb_val = row.get(house_col, '')
                if pd.isna(mawb_val):
                    continue
                    
                mawb = str(mawb_val).strip().replace(" ", "").replace("-", "")
                if 'e+' in mawb:
                    mawb = str(int(float(mawb_val)))
                elif mawb.endswith('.0'):
                    mawb = mawb[:-2]

                hawb = str(hawb_val).strip()
                if hawb == 'nan':
                    hawb = ''
                
                # ONLY select ISR starting house refs!
                if len(mawb) >= 3 and hawb.upper().startswith("ISR"):
                    prefix = mawb[:3].zfill(3)
                    if prefix in PREFIX_MAP:
                        airlineName = PREFIX_MAP[prefix]
                        if airlineName not in results:
                            results[airlineName] = {"mawb": mawb, "hawb": hawb}
    except Exception as e:
        print(f"Error reading {file_path}: {e}")

print(json.dumps(results, indent=2))
print("Missing:", set(PREFIX_MAP.values()) - set(results.keys()))
