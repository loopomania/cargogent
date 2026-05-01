import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const mawb = '01437625582';
  const hawb = 'ISR10055923';
  
  const schedule = await pool.query("SELECT tenant_id FROM query_schedule WHERE mawb = $1 LIMIT 1", [mawb]);
  console.log("Tenant ID from query_schedule:", schedule.rows[0]?.tenant_id);
  
  await pool.end();
}
run();
