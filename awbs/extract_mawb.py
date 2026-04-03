import pandas as pd
import json

path = '/Users/alonmarom/dev/cargogent/awbs/IL1 Shipment Profile Report Thursday, 19 March 2026 08_19_52.xlsx'

df = pd.read_excel(path, nrows=20)
print(df.to_string())
