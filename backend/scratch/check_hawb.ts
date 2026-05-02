import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const res2 = await client.query(`
    SELECT shipment_id, aggregated_status
    FROM leg_status_summary 
    WHERE shipment_id IN ('ISR10055514', 'ISR10055555')
  `);
  console.log("Lufthansa HAWBs:", res2.rows);
  await client.end();
}
run().catch(console.error);
