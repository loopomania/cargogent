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
    SET error_count_consecutive = 0, is_halted = false, next_status_check_at = NOW()
    WHERE error_count_consecutive >= 3 AND mawb LIKE '016%'
    RETURNING mawb, hawb
  `);
  console.log("Unblocked United Shipments:");
  console.table(qs.rows);
  pool.end();
}
main().catch(console.error);
