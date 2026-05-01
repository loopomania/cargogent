import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT status_code, location, occurred_at, status_text, provider, source, payload
    FROM query_events
    WHERE mawb = '07950938333' OR hawb = 'ISR10056001'
    ORDER BY occurred_at ASC
  `);
  console.log("EVENTS:");
  console.log(res.rows.map(r => `${r.provider} | ${r.source} | ${r.status_code} ${r.location} @ ${r.occurred_at}`).join("\n"));
  
  const res2 = await client.query(`
    SELECT summary->'status' as status
    FROM leg_status_summary
    WHERE shipment_id = 'ISR10056001' OR mawb = '07950938333' LIMIT 1
  `);
  console.log("\nSUMMARY STATUS:", res2.rows[0]?.status);
  
  await client.end();
}
run().catch(console.error);
