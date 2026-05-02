import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT shipment_id, aggregated_status, updated_at
    FROM leg_status_summary
    WHERE aggregated_status ILIKE '%DIS%'
    ORDER BY updated_at DESC
  `);
  
  console.log(`--- Shipments with CURRENT Status = DIS (${res.rows.length} total) ---`);
  res.rows.forEach(r => {
      console.log(`- Shipment ID: ${r.shipment_id} | Status: ${r.aggregated_status} | Last Updated: ${r.updated_at.toISOString().split('T')[0]}`);
  });
  
  await client.end();
}
run().catch(console.error);
