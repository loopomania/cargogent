import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const mawb = '01437625582';
  const hawb = 'ISR10055923';
  
  const res = await pool.query(
      "SELECT tenant_id FROM leg_status_summary WHERE shipment_id = $1 LIMIT 1",
      [hawb || mawb.replace(/-/g, "")]
    );
  console.log("Tenant ID from leg_status_summary:", res.rows[0]?.tenant_id);
  
  const events = await pool.query("SELECT tenant_id FROM query_events WHERE mawb = $1 LIMIT 1", [mawb]);
  console.log("Tenant ID from query_events:", events.rows[0]?.tenant_id);
  
  await pool.end();
}
run();
