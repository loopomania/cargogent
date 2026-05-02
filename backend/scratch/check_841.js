import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const qs = await pool.query(`
    SELECT mawb, hawb, ground_only, next_status_check_at, error_count_consecutive
    FROM query_schedule 
    WHERE mawb = '01692075841' AND hawb = 'ISR10056099'
  `);
  console.table(qs.rows);

  const ls = await pool.query(`
    SELECT aggregated_status, summary->>'raw_meta' as raw_meta
    FROM leg_status_summary 
    WHERE shipment_id = 'ISR10056099'
  `);
  if (ls.rows.length > 0) {
      console.log("Status:", ls.rows[0].aggregated_status);
      const raw = typeof ls.rows[0].raw_meta === 'string' ? JSON.parse(ls.rows[0].raw_meta) : ls.rows[0].raw_meta;
      console.log("Pieces:", raw?.pieces);
  }
  
  const events = await pool.query(`
    SELECT source, status_code, pieces
    FROM query_events
    WHERE mawb = '01692075841' AND hawb = 'ISR10056099' AND status_code = 'DLV'
  `);
  console.table(events.rows);

  pool.end();
}
main().catch(console.error);
