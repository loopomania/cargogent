import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const logs = await pool.query(`
    SELECT awb, hawb, airline_code, status, error_message, duration_ms, created_at
    FROM query_logs
    WHERE awb = '60753067792' AND hawb = 'ISR10055962'
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log("\n--- query_logs for '60753067792 / ISR10055962' ---");
  console.table(logs.rows);

  pool.end();
}
main().catch(console.error);
