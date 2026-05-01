import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT status_code, occurred_at, status_text
    FROM query_events
    WHERE mawb = '11463894644'
    ORDER BY occurred_at ASC
  `);
  console.log(res.rows);
  
  const res2 = await client.query(`
    SELECT aggregated_status, summary->>'message' as msg
    FROM leg_status_summary
    WHERE shipment_id = 'ISR10056740'
  `);
  console.log(res2.rows);
  
  await client.end();
}
run().catch(console.error);
