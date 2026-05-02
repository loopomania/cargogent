import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const qs = await pool.query(`
    SELECT created_at, awb
    FROM query_logs
    ORDER BY created_at DESC
    LIMIT 5
  `);
  console.log("Latest Query Logs globally:");
  qs.rows.forEach(r => console.log(r));
  pool.end();
}
main().catch(console.error);
