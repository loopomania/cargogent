import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const result = await pool.query(`
    UPDATE query_schedule 
    SET ground_only = true, is_halted = false, error_count_consecutive = 0, next_status_check_at = NOW()
    WHERE error_count_consecutive >= 3
    RETURNING mawb, hawb
  `);
  console.log("Marked as ground_only=true:");
  console.table(result.rows);
  pool.end();
}
main().catch(console.error);
