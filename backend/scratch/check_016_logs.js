import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const qs = await pool.query(`
    SELECT created_at, status, message 
    FROM query_logs 
    WHERE mawb = '01692075841' 
    ORDER BY created_at DESC LIMIT 5
  `);
  console.log("query_logs:", qs.rows);

  pool.end();
}
main().catch(console.error);
