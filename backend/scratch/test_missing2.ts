import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const mawb = '21707891354';
  
  const events = await pool.query("SELECT * FROM query_events WHERE mawb = $1", [mawb]);
  console.log("Events:", JSON.stringify(events.rows, null, 2));

  await pool.end();
}
run();
