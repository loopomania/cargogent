import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const ls = await pool.query(`
    SELECT summary->'raw_meta' as raw_meta
    FROM leg_status_summary 
    WHERE shipment_id = 'ISR10056087'
  `);
  console.log("Raw Meta:", JSON.stringify(ls.rows[0]?.raw_meta, null, 2));
  
  pool.end();
}
main().catch(console.error);
