import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const qs = await pool.query(`
    SELECT created_at, status, error_message
    FROM query_logs
    WHERE awb LIKE '%01692075804%'
    ORDER BY created_at DESC
    LIMIT 3
  `);
  console.log("Latest Query Logs for 01692075804:");
  qs.rows.forEach(r => console.log(r));
  pool.end();
}
main().catch(console.error);
