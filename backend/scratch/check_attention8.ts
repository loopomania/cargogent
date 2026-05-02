import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const qsRes = await pool.query(`
    SELECT mawb, hawb
    FROM query_schedule
    WHERE error_count_consecutive > 0 OR is_halted = true
    ORDER BY error_count_consecutive DESC;
  `);

  for (const row of qsRes.rows.slice(0, 10)) {
    const logRes = await pool.query(`
       SELECT error_message, airline_response
       FROM query_logs
       WHERE awb = $1 AND (error_message IS NOT NULL OR error_message != '')
       ORDER BY created_at DESC
       LIMIT 1
    `, [row.mawb]);
    
    console.log(`MAWB: ${row.mawb}`);
    if (logRes.rows.length > 0) {
      console.log(`  Error: ${logRes.rows[0].error_message}`);
    } else {
      console.log(`  No error log found.`);
    }
  }

  await pool.end();
}
run();
