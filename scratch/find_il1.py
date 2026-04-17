import pandas as pd
df = pd.read_excel('AWBS/IL1 Shipment Profile Report Friday, 10 April 2026 15_23_15.xlsx', header=None, skiprows=13, nrows=5)
for i, row in df.iterrows():
    vals = list(row.values)
    print(f"Row {i}:")
    for j, v in enumerate(vals):
        if pd.notna(v) and str(v).strip():
            print(f"  Col {j}: {v}")
