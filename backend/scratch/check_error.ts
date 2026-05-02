import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT aggregated_status, summary, updated_at
    FROM leg_status_summary
    WHERE shipment_id = 'ISR10056913'
  `);
  console.log("Status summary:", res.rows[0]);

  const res2 = await client.query(`
    SELECT error_count_consecutive, is_halted, next_status_check_at, last_check_at
    FROM query_schedule
    WHERE mawb = '07161180464' AND hawb = 'ISR10056913'
  `);
  console.log("Query Schedule:", res2.rows[0]);
  await client.end();
}
run().catch(console.error);
