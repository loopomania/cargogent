import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT shipment_id, aggregated_status 
    FROM leg_status_summary 
    WHERE shipment_id = '01437625685'
  `);
  console.log(res.rows);
  await client.end();
}
run().catch(console.error);
