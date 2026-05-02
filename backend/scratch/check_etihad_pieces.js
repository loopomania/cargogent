import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const qs = await pool.query(`
    SELECT status_code, pieces, payload->>'actual_pieces' as actual_pieces, location
    FROM query_events 
    WHERE mawb = '60753067792' AND status_code = 'DLV'
  `);
  console.log("DLV Events:", qs.rows);

  const lss = await pool.query(`
    SELECT summary->>'raw_meta' as raw_meta
    FROM leg_status_summary
    WHERE shipment_id = 'ISR10055962'
  `);
  console.log("Raw Meta:", lss.rows[0]?.raw_meta);
  
  pool.end();
}
main().catch(console.error);
