import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const eventsRes = await pool.query(
    "SELECT source FROM query_events WHERE mawb LIKE '%23202535%' LIMIT 1"
  );
  console.log("Source is: ", eventsRes.rows[0]?.source);
  await pool.end();
}
run();
