import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const qs = await pool.query(`
    SELECT mawb, hawb, domain_name, last_check_at
    FROM query_schedule 
    WHERE error_count_consecutive >= 3
    ORDER BY last_check_at DESC
  `);
  console.table(qs.rows);
  pool.end();
}
main().catch(console.error);
