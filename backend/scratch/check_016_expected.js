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

  const dbExpected = await pool.query(
      `SELECT SUM(pieces_pcs) as total 
       FROM excel_transport_lines 
       WHERE master_awb = $1 AND COALESCE(house_ref, '') = COALESCE($2, '')`,
      [mawb, hawb]
  );
  console.log("Excel Total:", dbExpected.rows[0]);

  const qs = await pool.query(`
    SELECT source, status_code, location, pieces, payload->>'actual_pieces' as actual_pieces 
    FROM query_events 
    WHERE mawb = $1 AND hawb = $2 AND status_code = 'DLV'
  `, [mawb, hawb]);
  console.log("DLV Events:", qs.rows);

  pool.end();
}
main().catch(console.error);
