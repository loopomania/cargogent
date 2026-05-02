import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const qsRes = await pool.query(`
    SELECT mawb, hawb, domain_name, error_count_consecutive, is_halted, stale_alert_sent, next_status_check_at, last_check_at
    FROM query_schedule
    WHERE error_count_consecutive > 0 OR is_halted = true OR stale_alert_sent = true
    ORDER BY error_count_consecutive DESC;
  `);

  console.log("Need Attention Shipments:");
  console.log(JSON.stringify(qsRes.rows, null, 2));

  // Now, get the last status message from leg_status_summary for each
  for (const row of qsRes.rows) {
    const lsRes = await pool.query(`
      SELECT summary->>'status' as status, summary->>'message' as message
      FROM leg_status_summary
      WHERE shipment_id LIKE '%' || $1 || '%'
      LIMIT 1
    `, [row.mawb.substring(3)]);
    console.log(`MAWB: ${row.mawb}, HAWB: ${row.hawb}`);
    if (lsRes.rows.length > 0) {
      console.log(`  Status: ${lsRes.rows[0].status}`);
      console.log(`  Message: ${lsRes.rows[0].message}`);
    } else {
      console.log(`  No summary found.`);
    }
    
    const evRes = await pool.query(`
       SELECT status_text, payload
       FROM query_events
       WHERE mawb = $1
       ORDER BY created_at DESC
       LIMIT 1
    `, [row.mawb]);
    if (evRes.rows.length > 0) {
      console.log(`  Last Event Status: ${evRes.rows[0].status_text}`);
      const payload = JSON.parse(evRes.rows[0].payload);
      console.log(`  Last Event Message: ${payload.message}`);
    }
  }

  await pool.end();
}
run();
