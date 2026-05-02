import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const qs = await pool.query(`SELECT is_halted, error_count_consecutive, next_status_check_at FROM query_schedule WHERE mawb = '01692075804'`);
  console.log("QS:", qs.rows[0]);
  pool.end();
}
main().catch(console.error);
