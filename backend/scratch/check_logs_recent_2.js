import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const q = await pool.query(`
    SELECT created_at, awb, status, error_message
    FROM query_logs
    WHERE status = 'ERROR' AND created_at > NOW() - interval '2 hours'
    ORDER BY created_at DESC
    LIMIT 20
  `);
  console.log("Recent errors in last 2 hours:", q.rows);
  
  const activeHalted = await pool.query(`
    SELECT mawb, hawb, error_count_consecutive
    FROM query_schedule
    WHERE error_count_consecutive > 0
  `);
  console.log("Active shipments with error counts:", activeHalted.rows);
  
  pool.end();
}
main().catch(console.error);
