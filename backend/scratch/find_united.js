import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const qs = await pool.query(`
    SELECT mawb, hawb FROM query_schedule 
    WHERE mawb LIKE '016%'
    LIMIT 5
  `);
  console.log("United Shipments:", qs.rows);
  pool.end();
}
main().catch(console.error);
