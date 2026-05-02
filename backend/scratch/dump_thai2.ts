import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const lsRes = await pool.query(
    "SELECT summary FROM leg_status_summary WHERE mawb = '21707891354' LIMIT 1"
  );
  if (lsRes.rows.length > 0) {
    console.log(JSON.stringify(lsRes.rows[0].summary.raw_meta.excel_legs, null, 2));
  } else {
    console.log("Not found in leg_status_summary either");
  }
  await pool.end();
}
run();
