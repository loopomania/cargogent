import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const qsRes = await pool.query(`
    SELECT mawb, hawb, domain_name, error_count_consecutive, is_halted, stale_alert_sent
    FROM query_schedule
    WHERE error_count_consecutive > 0 OR is_halted = true OR stale_alert_sent = true
    ORDER BY error_count_consecutive DESC;
  `);

  console.log("Need Attention Shipments (Halted / Errors / Stale):\n");

  for (const row of qsRes.rows) {
    let msg = "";
    const evRes = await pool.query(`
       SELECT status_text, payload
       FROM query_events
       WHERE mawb = $1 AND (source = 'airline' OR payload->>'message' IS NOT NULL)
       ORDER BY created_at DESC
       LIMIT 1
    `, [row.mawb]);
    
    if (evRes.rows.length > 0) {
      const payload = evRes.rows[0].payload;
      msg = payload.message || evRes.rows[0].status_text;
    } else {
      msg = "No tracking events recorded yet.";
    }
    
    console.log(`MAWB: ${row.mawb} | HAWB: ${row.hawb}`);
    console.log(`  Halted: ${row.is_halted} | Errors: ${row.error_count_consecutive} | Stale Alert: ${row.stale_alert_sent}`);
    console.log(`  Last Message/Status: ${msg}\n`);
  }

  await pool.end();
}
run();
