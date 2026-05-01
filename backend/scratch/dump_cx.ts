import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const eventsRes = await pool.query(
    "SELECT payload FROM query_events WHERE mawb = '21707891354' AND source = 'airline' ORDER BY created_at ASC"
  );
  for (const row of eventsRes.rows) {
     const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
     if (payload.status_code) {
        console.log(`[${payload.date}] ${payload.status_code} at ${payload.location} | Flt: ${payload.flight} | Pcs: ${payload.pieces}`);
     }
  }
  await pool.end();
}
run();
