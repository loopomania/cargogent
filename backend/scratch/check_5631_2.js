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
  pool.end();
}
main().catch(console.error);
