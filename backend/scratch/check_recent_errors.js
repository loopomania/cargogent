import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const result = await pool.query(`
    SELECT airline, mawb, hawb, message, duration_s, created_at
    FROM awb_latest_change
    WHERE event_type = 'QUERY_ERROR'
    ORDER BY created_at DESC
    LIMIT 20
  `);
  
  if (result.rows.length > 0) {
      console.log("\n--- Recent Query Errors ---");
      console.table(result.rows);
  } else {
      console.log("No QUERY_ERROR events found in awb_latest_change.");
  }
  
  // also check sys_logs if that exists, or maybe awbTrackers proxy logs
  pool.end();
}
main().catch(console.error);
