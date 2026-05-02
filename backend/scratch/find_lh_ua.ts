import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const lufthansa = await pool.query(`
    SELECT DISTINCT qs.mawb, ls.summary->>'airline' as airline
    FROM query_schedule qs
    JOIN leg_status_summary ls ON qs.hawb = ls.shipment_id
    WHERE qs.mawb LIKE '020%' AND ls.summary->>'airline' ILIKE '%lufthansa%'
    ORDER BY qs.mawb DESC
    LIMIT 3;
  `);
  console.log("Lufthansa Shipments:");
  console.log(lufthansa.rows.map(r => r.mawb));

  const united = await pool.query(`
    SELECT DISTINCT qs.mawb, ls.summary->>'airline' as airline
    FROM query_schedule qs
    JOIN leg_status_summary ls ON qs.hawb = ls.shipment_id
    WHERE qs.mawb LIKE '016%' AND ls.summary->>'airline' ILIKE '%united%'
    ORDER BY qs.mawb DESC
    LIMIT 3;
  `);
  console.log("United Shipments:");
  console.log(united.rows.map(r => r.mawb));

  await pool.end();
}
run();
