import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const qs = await pool.query(`
    SELECT source, provider, status_code, status_text, location, pieces 
    FROM query_events 
    WHERE mawb = '60753067792'
    ORDER BY occurred_at DESC LIMIT 10
  `);
  console.log("All Events:", qs.rows);
  pool.end();
}
main().catch(console.error);
