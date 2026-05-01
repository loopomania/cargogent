import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const qs = await pool.query(`
    SELECT occurred_at, status_code, pieces
    FROM query_events 
    WHERE mawb = '01692075631' AND hawb = 'ISR10055340'
    ORDER BY occurred_at DESC
  `);
  console.table(qs.rows);
  
  const ls = await pool.query(`
    SELECT summary->>'raw_meta' as raw_meta
    FROM leg_status_summary 
    WHERE shipment_id = 'ISR10055340'
  `);
  const raw = typeof ls.rows[0].raw_meta === 'string' ? JSON.parse(ls.rows[0].raw_meta) : ls.rows[0].raw_meta;
  console.log("raw_meta pieces:", raw.pieces);
  
  pool.end();
}
main().catch(console.error);
