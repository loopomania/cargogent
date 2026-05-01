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

  const qs = await pool.query(`
    SELECT status_code, status_text, location, payload->>'status' as p_status 
    FROM query_events 
    WHERE mawb = $1 AND hawb = $2
    ORDER BY occurred_at DESC LIMIT 5
  `, [mawb, hawb]);
  console.log("events:", qs.rows);

  pool.end();
}
main().catch(console.error);
