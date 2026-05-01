import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const qsRes = await pool.query("SELECT hawb FROM query_schedule WHERE mawb = '21707891354'");
  if (qsRes.rows.length === 0) return console.log("Not found in qs");
  
  const hawb = qsRes.rows[0].hawb;
  const lsRes = await pool.query(
    "SELECT summary FROM leg_status_summary WHERE shipment_id = $1 LIMIT 1", [hawb]
  );
  if (lsRes.rows.length > 0) {
    console.log(JSON.stringify(lsRes.rows[0].summary, null, 2));
  } else {
    console.log("Not found in leg_status_summary");
  }
  await pool.end();
}
run();
