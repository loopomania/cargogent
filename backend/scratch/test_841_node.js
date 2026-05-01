import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const qUrl = `http://localhost:${process.env.PORT || 3000}/api/track/01692075841?hawb=ISR10056099`;
  console.log("Triggering track endpoint...", qUrl);
  
  const req = await fetch(qUrl, { method: "GET" });
  const res = await req.json();
  console.log("Response status:", res.status);
  
  const ls = await pool.query(`
    SELECT aggregated_status
    FROM leg_status_summary 
    WHERE shipment_id = 'ISR10056099'
  `);
  console.log("New DB Status:", ls.rows[0]?.aggregated_status);
  pool.end();
}
main().catch(console.error);
