import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const qs = await pool.query(`
    SELECT status_code, occurred_at 
    FROM query_events 
    WHERE mawb = '01692075841' AND hawb = 'ISR10056087'
    ORDER BY occurred_at DESC
  `);
  console.log("Events by date:", qs.rows);
  pool.end();
}
main().catch(console.error);
