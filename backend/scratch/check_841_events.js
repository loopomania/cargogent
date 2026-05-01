import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const events = await pool.query(`
    SELECT source, status_code, pieces, occurred_at
    FROM query_events
    WHERE mawb = '01692075841' AND hawb = 'ISR10056099'
    ORDER BY occurred_at DESC
  `);
  console.table(events.rows);
  
  const excel = await pool.query(`
    SELECT leg_load_port, leg_discharge_port
    FROM excel_transport_lines 
    WHERE master_awb = '01692075841' AND house_ref = 'ISR10056099'
  `);
  console.log("excel:", excel.rows);
  
  pool.end();
}
main().catch(console.error);
