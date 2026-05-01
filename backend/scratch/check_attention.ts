import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const query = `
    SELECT 
      qs.mawb, 
      qs.hawb, 
      qs.error_count_consecutive, 
      qs.is_halted, 
      qs.stale_alert_sent,
      ls.summary->>'status' as status,
      ls.summary->>'message' as message
    FROM query_schedule qs
    LEFT JOIN leg_status_summary ls ON qs.shipment_id = ls.shipment_id
    WHERE qs.error_count_consecutive > 0 OR qs.is_halted = true OR qs.stale_alert_sent = true
    ORDER BY qs.error_count_consecutive DESC;
  `;
  const res = await pool.query(query);
  console.log("Need Attention Shipments:", JSON.stringify(res.rows, null, 2));
  
  await pool.end();
}
run();
