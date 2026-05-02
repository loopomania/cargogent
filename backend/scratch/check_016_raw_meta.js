import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const qs = await pool.query(`
    SELECT summary->>'raw_meta' as raw_meta 
    FROM leg_status_summary 
    WHERE shipment_id = 'ISR10056087'
  `);
  console.log("raw_meta:", qs.rows[0].raw_meta);
  pool.end();
}
main().catch(console.error);
