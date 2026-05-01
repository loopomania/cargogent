import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const halted = await pool.query(`
    SELECT count(*) FROM query_schedule
    WHERE error_count_consecutive >= 3 AND is_halted = true
  `);
  console.log("Halted due to errors:", halted.rows[0].count);
  pool.end();
}
main().catch(console.error);
