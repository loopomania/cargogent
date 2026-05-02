import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const mawb = '21707891354';
  const events = await pool.query("SELECT * FROM query_events WHERE mawb = $1 ORDER BY created_at DESC LIMIT 5", [mawb]);
  console.log("Recent Events:", JSON.stringify(events.rows.map(r => ({status_text: r.status_text, source: r.source, created: r.created_at})), null, 2));

  const summaries = await pool.query("SELECT summary->>'message' as msg, updated_at FROM leg_status_summary WHERE shipment_id LIKE $1 ORDER BY updated_at DESC LIMIT 2", [`%${mawb.substring(5)}%`]);
  console.log("Recent Summaries:", JSON.stringify(summaries.rows, null, 2));
  
  await pool.end();
}
run();
