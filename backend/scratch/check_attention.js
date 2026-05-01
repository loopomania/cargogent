import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const mawb = '01692075841';
  const hawb = 'ISR10056087';

  const qs = await pool.query(`SELECT * FROM query_schedule WHERE mawb = $1 AND hawb = $2`, [mawb, hawb]);
  console.log("query_schedule:", qs.rows);

  const lss = await pool.query(`SELECT aggregated_status, last_event_at, summary FROM leg_status_summary WHERE shipment_id = $1`, [hawb]);
  console.log("leg_status_summary:", lss.rows);

  pool.end();
}
main().catch(console.error);
