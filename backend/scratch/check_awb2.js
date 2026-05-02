import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const qs = await pool.query(`
    SELECT * FROM query_schedule 
    WHERE mawb = '01692075841' AND hawb = 'ISR10056087'
  `);
  console.log("Query Schedule:", qs.rows);

  const ls = await pool.query(`
    SELECT aggregated_status, last_event_at, summary->>'events_count' as event_count, summary->>'pieces' as summary_pieces, updated_at
    FROM leg_status_summary 
    WHERE shipment_id = 'ISR10056087'
  `);
  console.log("Leg Status Summary:", ls.rows);

  const qe = await pool.query(`
    SELECT occurred_at, status_code, status_text, location, pieces, payload->>'actual_pieces' as actual_pcs
    FROM query_events 
    WHERE mawb = '01692075841' AND hawb = 'ISR10056087'
    ORDER BY occurred_at DESC
  `);
  console.log("Query Events:", qe.rows);

  const xl = await pool.query(`
    SELECT SUM(pieces_pcs) as total_excel_pcs
    FROM excel_transport_lines 
    WHERE master_awb = '01692075841' AND house_ref = 'ISR10056087'
  `);
  console.log("Excel Transport Lines:", xl.rows);
  
  pool.end();
}
main().catch(console.error);
