import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const eventsRes = await pool.query(
    "SELECT payload FROM query_events WHERE mawb LIKE '%23202535%' ORDER BY created_at ASC"
  );
  for (const row of eventsRes.rows) {
      const ev = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
      console.log(`[${ev.date}] ${ev.status_code} at ${ev.location} | Flt: ${ev.flight} | Pcs: ${ev.pieces}`);
  }
  await pool.end();
}
run();
