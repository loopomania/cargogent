import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const qs = await pool.query(`
    SELECT occurred_at, status_code, location, source, provider
    FROM query_events 
    WHERE mawb = '01692075841' AND hawb = 'ISR10056087'
    ORDER BY occurred_at DESC
  `);
  console.log("Events for 016-92075841 / ISR10056087:");
  console.table(qs.rows);
  pool.end();
}
main().catch(console.error);
