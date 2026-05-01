import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT shipment_id, aggregated_status
    FROM leg_status_summary
    WHERE shipment_id LIKE '%11463894644%' OR shipment_id = 'ISR10056740' OR summary->>'mawb' = '11463894644'
  `);
  console.log("Leg Status Summary:");
  console.log(res.rows);
  
  await client.end();
}
run().catch(console.error);
