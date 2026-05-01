import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const res = await pool.query(`
    UPDATE query_schedule
    SET is_halted = false, error_count_consecutive = 0, next_status_check_at = NOW()
    WHERE error_count_consecutive >= 3 AND is_halted = true
  `);
  console.log(`Un-halted ${res.rowCount} shipments that were falsely stuck by API errors.`);
  pool.end();
}
main().catch(console.error);
