import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const result = await pool.query(`
    SELECT mawb, hawb, error_count_consecutive, is_halted, next_status_check_at, last_check_at
    FROM query_schedule
    WHERE mawb LIKE '607%'
    ORDER BY error_count_consecutive DESC
    LIMIT 10
  `);
  
  console.log("\n--- Top 10 '607' (Etihad) queries by consecutive errors ---");
  console.table(result.rows);
  
  const cb = await fetch('https://app.cargogent.com/api/services/circuit-breakers', {
      // Need an admin cookie or token, but the route is requireAdmin. 
      // Instead, we can just look at query_logs for 607.
  }).catch(() => null);

  const logs = await pool.query(`
    SELECT awb, status, error_message, duration_ms, created_at
    FROM query_logs
    WHERE airline_code = 'etihad'
    ORDER BY created_at DESC
    LIMIT 5
  `);
  console.log("\n--- Last 5 query_logs for 'etihad' ---");
  console.table(logs.rows);

  pool.end();
}
main().catch(console.error);
