import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const qs = await pool.query(`
    SELECT status_code, pieces, payload->>'actual_pieces' as actual_pieces, occurred_at, location, source
    FROM query_events
    WHERE mawb = '01692075804'
    ORDER BY occurred_at ASC
  `);
  console.log("DB Events for 01692075804:");
  qs.rows.forEach(r => console.log(r));
  
  const status = await pool.query(`
    SELECT aggregated_status, summary->>'raw_meta' as raw_meta
    FROM leg_status_summary
    WHERE shipment_id = 'ISR10055888'
  `);
  console.log("Status:", status.rows[0]);
  pool.end();
}
main().catch(console.error);
