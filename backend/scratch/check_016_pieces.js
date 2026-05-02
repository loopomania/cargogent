import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const qs = await pool.query(`
    SELECT status_code, pieces, payload->>'actual_pieces' as actual_pieces
    FROM query_events 
    WHERE mawb = '01692075841' AND hawb = 'ISR10056087'
  `);
  console.log("Pieces:", qs.rows);
  pool.end();
}
main().catch(console.error);
