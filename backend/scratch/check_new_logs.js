import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const errs = await pool.query(`
    SELECT created_at, awb, error_message
    FROM query_logs
    WHERE status = 'ERROR' AND created_at > NOW() - interval '10 minutes'
    ORDER BY created_at DESC
    LIMIT 20
  `);
  console.log("Recent Errors:", errs.rows);
  pool.end();
}
main().catch(console.error);
