import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const q = await pool.query(`
    SELECT created_at, awb, status, error_message
    FROM query_logs
    WHERE created_at > '2026-04-29T07:31:40Z'
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log("Recent after deployment:", q.rows);
  pool.end();
}
main().catch(console.error);
