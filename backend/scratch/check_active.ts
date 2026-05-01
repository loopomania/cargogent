import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT shipment_id, aggregated_status
    FROM leg_status_summary 
    WHERE aggregated_status NOT ILIKE '%Delivered%' 
        AND aggregated_status NOT ILIKE '%Delivery%'
        AND aggregated_status NOT ILIKE '%DLV%'
        AND aggregated_status NOT ILIKE '%DIS%'
        AND aggregated_status != 'Archived'
    LIMIT 20
  `);
  console.log(res.rows);
  await client.end();
}
run().catch(console.error);
