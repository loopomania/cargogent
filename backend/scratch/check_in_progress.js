import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const pendingQuery = await pool.query(`
    SELECT next_status_check_at, error_count_consecutive, stale_alert_sent
    FROM query_schedule 
    LIMIT 5
  `);
  console.log("Samples:", pendingQuery.rows);
  pool.end();
}
main().catch(console.error);
