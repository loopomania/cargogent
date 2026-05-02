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
    const evRes = await pool.query(`
       SELECT payload
       FROM query_events
       WHERE mawb = $1 AND source = 'airline'
       ORDER BY created_at DESC
       LIMIT 1
    `, [row.mawb]);
    console.log(`MAWB: ${row.mawb}`);
    if (evRes.rows.length > 0) {
      const payload = evRes.rows[0].payload;
      console.log(`  Status: ${payload.status}`);
      console.log(`  Message: ${payload.message}`);
    } else {
      console.log(`  No airline event found.`);
    }
  }

  await pool.end();
}
run();
