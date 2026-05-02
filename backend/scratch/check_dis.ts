import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT DISTINCT mawb, hawb
    FROM query_events
    WHERE status_code = 'DIS'
    ORDER BY mawb DESC
  `);
  
  console.log(`--- Shipments with DIS Event (${res.rows.length} total) ---`);
  res.rows.forEach(r => {
      console.log(`- MAWB: ${r.mawb} | HAWB: ${r.hawb || 'N/A'}`);
  });
  
  await client.end();
}
run().catch(console.error);
