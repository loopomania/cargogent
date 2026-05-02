import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const qs = await pool.query(`
    UPDATE query_schedule 
    SET is_halted = false, stale_alert_sent = false, next_status_check_at = NOW() - interval '1 hour', error_count_consecutive = 0
    WHERE mawb LIKE '016%' OR mawb LIKE '079%'
    RETURNING mawb, hawb
  `);
  console.table(qs.rows);
  pool.end();
}
main().catch(console.error);
