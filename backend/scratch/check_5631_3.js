import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const qs = await pool.query(`
    SELECT mawb, hawb, next_status_check_at, last_check_at, error_count_consecutive, is_halted
    FROM query_schedule 
    WHERE mawb = '01692075631' AND hawb = 'ISR10055340'
  `);
  console.table(qs.rows);
  
  const ql = await pool.query(`
    SELECT created_at, status, duration_ms, error_message
    FROM query_logs
    WHERE awb = '01692075631' AND hawb = 'ISR10055340'
    ORDER BY created_at DESC
    LIMIT 3
  `);
  console.table(ql.rows);
  pool.end();
}
main().catch(console.error);
