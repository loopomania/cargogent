import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const errs = await pool.query(`
    SELECT created_at, awb, error_message
    FROM query_logs
    WHERE status = 'ERROR' AND awb IN ('11463893690', '01692075664', '16083500012', '21707891435')
    ORDER BY created_at DESC
    LIMIT 20
  `);
  console.log("Errors:", errs.rows);
  pool.end();
}
main().catch(console.error);
