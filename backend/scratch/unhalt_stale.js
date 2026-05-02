import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const res = await pool.query(`
    UPDATE query_schedule
    SET is_halted = false, stale_alert_sent = false, next_status_check_at = NOW()
    WHERE stale_alert_sent = true
  `);
  console.log(`Un-halted ${res.rowCount} shipments that were falsely stuck by 24h stale logic.`);
  pool.end();
}
main().catch(console.error);
