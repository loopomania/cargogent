import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const challenge = await pool.query(`
    SELECT DISTINCT qs.mawb, ls.summary->>'airline' as airline
    FROM query_schedule qs
    JOIN leg_status_summary ls ON qs.hawb = ls.shipment_id
    WHERE ls.summary->>'airline' ILIKE '%challenge%'
    ORDER BY qs.mawb DESC
    LIMIT 3;
  `);
  console.log("Challenge Shipments:");
  console.log(challenge.rows);

  await pool.end();
}
run();
