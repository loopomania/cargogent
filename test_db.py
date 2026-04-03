import psycopg2
import json

with open(".env-prod") as f:
    env = dict(line.strip().split('=', 1) for line in f if '=' in line)

conn = psycopg2.connect(env['DATABASE_URL'] + "?sslmode=require")
cur = conn.cursor()
cur.execute("SELECT raw_response FROM awb_latest_status WHERE mawb='16083499360' AND hawb='ISR10051862'")
row = cur.fetchone()
if row:
    resp = row[0]
    for ev in resp.get("events", []):
        print(f"Status: {ev.get('status_code')} | Loc: {ev.get('location')} | Date: {ev.get('date')} | Remarks: {ev.get('remarks')}")
else:
    print("Not found")
