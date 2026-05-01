import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const mawb = '01692075664';
  const hawb = 'ISR10055902';
  
  const lsRes = await pool.query(
    "SELECT summary FROM leg_status_summary WHERE shipment_id = $1",
    [hawb]
  );
  if (lsRes.rows.length > 0) {
    console.log("=== leg_status_summary ===");
    console.log(JSON.stringify(lsRes.rows[0].summary, null, 2));
  } else {
    console.log("No leg_status_summary found.");
  }
  await pool.end();
}
run();
