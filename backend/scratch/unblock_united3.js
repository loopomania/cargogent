import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const qs = await pool.query(`
    SELECT mawb, hawb, next_status_check_at, is_halted, stale_alert_sent
    FROM query_schedule 
    WHERE mawb LIKE '016%' OR mawb LIKE '079%'
  `);
  console.table(qs.rows);
  pool.end();
}
main().catch(console.error);
