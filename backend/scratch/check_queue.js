import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const pendingQuery = await pool.query(`
    SELECT count(*) FROM query_schedule 
    WHERE next_status_check_at <= now() 
      AND is_halted = false 
  `);
  console.log("Pending rows:", pendingQuery.rows[0].count);
  pool.end();
}
main().catch(console.error);
