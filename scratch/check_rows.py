import pandas as pd
df1 = pd.read_excel('AWBS/IL1 Shipment Profile Report Friday, 10 April 2026 15_23_15.xlsx', skiprows=2)
df2 = pd.read_excel('AWBS/L2077 - Air Import T_020260406075502006649615944906.xlsx', skiprows=3)

print("IL1 total rows:", len(df1))
print("L2077 total rows:", len(df2))
