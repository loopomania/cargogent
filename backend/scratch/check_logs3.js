import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const q = await pool.query(`
    SELECT created_at, awb, source, status, error_message
    FROM query_logs
    ORDER BY created_at DESC
    LIMIT 20
  `);
  console.log(q.rows);
  pool.end();
}
main().catch(console.error);
