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
      qs.domain_name,
      qs.error_count_consecutive, 
      qs.is_halted, 
      qs.stale_alert_sent,
      ls.summary->>'status' as status,
      ls.summary->>'message' as message
    FROM query_schedule qs
    LEFT JOIN leg_status_summary ls 
      ON qs.tenant_id = ls.tenant_id 
      AND qs.mawb = ls.mawb 
      AND (qs.hawb = ls.hawb OR (qs.hawb IS NULL AND ls.hawb IS NULL))
    WHERE qs.error_count_consecutive > 0 OR qs.is_halted = true OR qs.stale_alert_sent = true
    ORDER BY qs.error_count_consecutive DESC;
  `;
  const res = await pool.query(query);
  console.log("Need Attention Shipments:", JSON.stringify(res.rows, null, 2));
  
  await pool.end();
}
run();
