import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const history = await pool.query(`
    SELECT event_type, payload
    FROM awb_latest_change
    WHERE hawb = 'ISR10056099' AND event_type = 'STATUS_CHANGE'
    ORDER BY created_at DESC
  `);
  console.log("History:", history.rows);
  pool.end();
}
main().catch(console.error);
