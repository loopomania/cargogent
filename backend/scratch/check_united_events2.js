import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const qs = await pool.query(`
    SELECT hawb, pieces, occurred_at 
    FROM query_events 
    WHERE mawb = '01692075841' AND status_code = 'DLV'
  `);
  console.log("Events:", qs.rows);
  pool.end();
}
main().catch(console.error);
