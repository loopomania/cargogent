import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const eventsRes = await pool.query(
    "SELECT created_at FROM query_events WHERE mawb LIKE '%23202535%' ORDER BY created_at DESC LIMIT 1"
  );
  if (eventsRes.rows.length > 0) {
      console.log(`Latest event created_at: ${eventsRes.rows[0].created_at}`);
  }
  await pool.end();
}
run();
