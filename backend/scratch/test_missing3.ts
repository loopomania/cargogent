import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const hawb = 'ISR10055356';
  
  const summary = await pool.query(
      "SELECT * FROM leg_status_summary WHERE shipment_id = $1",
      [hawb]
    );
  console.log("Summary:", JSON.stringify(summary.rows, null, 2));

  await pool.end();
}
run();
