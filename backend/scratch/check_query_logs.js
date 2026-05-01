import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const result = await pool.query(`
    SELECT awb, hawb, airline_code, status, error_message, created_at
    FROM query_logs
    WHERE status = 'Error' OR error_message IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 15
  `);
  
  if (result.rows.length > 0) {
      console.log("\n--- Recent Errors in query_logs ---");
      console.table(result.rows);
  } else {
      console.log("No errors found in query_logs.");
  }
  pool.end();
}
main().catch(console.error);
