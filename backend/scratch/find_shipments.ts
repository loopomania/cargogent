import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  // El Al (114)
  const elal = await pool.query(`
    SELECT DISTINCT qs.mawb, qs.hawb, ls.summary->>'airline' as airline
    FROM query_schedule qs
    JOIN leg_status_summary ls ON qs.hawb = ls.shipment_id
    WHERE qs.mawb LIKE '114%' AND ls.summary->>'airline' ILIKE '%el%al%'
    ORDER BY qs.mawb DESC
    LIMIT 3;
  `);
  console.log("El Al Shipments:");
  console.log(elal.rows);

  // Challenge Airlines
  const challenge = await pool.query(`
    SELECT DISTINCT qs.mawb, qs.hawb, ls.summary->>'airline' as airline
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
