import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const eventsRes = await pool.query(
    "SELECT payload FROM query_events WHERE mawb LIKE '%23202535%' ORDER BY created_at DESC LIMIT 1"
  );
  if (eventsRes.rows.length === 0) return console.log("Not found in db");
  const payload = typeof eventsRes.rows[0].payload === 'string' ? JSON.parse(eventsRes.rows[0].payload) : eventsRes.rows[0].payload;
  for (const ev of payload.events || []) {
      console.log(`[${ev.date}] ${ev.status_code} at ${ev.location} | Flt: ${ev.flight} | Pcs: ${ev.pieces}`);
  }
  await pool.end();
}
run();
