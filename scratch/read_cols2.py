import pandas as pd
import json

df_il1 = pd.read_excel('AWBS/IL1 Shipment Profile Report Friday, 10 April 2026 15_23_15.xlsx')
df_imp = pd.read_excel('AWBS/L2077 - Air Import T_020260406075502006649615944906.xlsx', skiprows=3)

# Filter out empty rows
df_il1 = df_il1.dropna(subset=['MAWB']) if 'MAWB' in df_il1.columns else df_il1
df_imp = df_imp.dropna(subset=['MAWB']) if 'MAWB' in df_imp.columns else df_imp

res = {
    'IL1_cols': df_il1.columns.tolist(),
    'IL1_sample': df_il1[['MAWB', 'HAWB', 'Airline Code', 'Airline Name']].head().to_dict('records') if 'MAWB' in df_il1.columns else [],
    'L2077_cols': df_imp.columns.tolist(),
    'L2077_sample': df_imp[['MAWB', 'HAWB', 'Routing Airline', 'Carrier Name', 'Carrier Prefix']].head().to_dict('records') if 'MAWB' in df_imp.columns else [],
}

with open('scratch/cols.json', 'w') as f:
    json.dump(res, f, indent=2)
