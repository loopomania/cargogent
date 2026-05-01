import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const errs = await pool.query(`
    SELECT qs.mawb, qs.hawb, qs.error_count_consecutive
    FROM query_schedule qs
    WHERE qs.error_count_consecutive > 0
  `);
  console.log("Shipments with NEW errors:", errs.rows);
  
  const pending = await pool.query(`
    SELECT count(*) FROM query_schedule
    WHERE next_status_check_at <= now() 
      AND is_halted = false 
  `);
  console.log("Pending rows still in queue:", pending.rows[0].count);
  
  pool.end();
}
main().catch(console.error);
