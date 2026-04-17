import pandas as pd
df1 = pd.read_excel('AWBS/IL1 Shipment Profile Report Friday, 10 April 2026 15_23_15.xlsx', nrows=15)
df2 = pd.read_excel('AWBS/L2077 - Air Import T_020260406075502006649615944906.xlsx', nrows=15)
print("IL1 First 15 rows:\n", df1.to_string())
print("\nL2077 First 15 rows:\n", df2.to_string())
