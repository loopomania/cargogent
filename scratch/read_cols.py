import pandas as pd

# 1. 'IL1 Shipment Profile Report Friday, 10 April 2026 15_23_15.xlsx'
df_il1 = pd.read_excel('AWBS/IL1 Shipment Profile Report Friday, 10 April 2026 15_23_15.xlsx')
print("IL1 Columns:", df_il1.columns.tolist())
if 'MAWB' in df_il1.columns:
    print("IL1 Sample AWBs:")
    print(df_il1[['MAWB', 'HAWB', 'Airline Name', 'Airline Code']].head())

# 2. 'L2077 - Air Import...'
df_imp = pd.read_excel('AWBS/L2077 - Air Import T_020260406075502006649615944906.xlsx')
print("\nL2077 Columns:", df_imp.columns.tolist())
if len(df_imp.columns) > 1:
    print("L2077 Sample AWBs:")
    print(df_imp.head())
