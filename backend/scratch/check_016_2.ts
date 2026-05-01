import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT summary->'raw_meta'->'excel_legs' as xl, summary->'origin' as origin, summary->'destination' as dest
    FROM leg_status_summary
    WHERE shipment_id = 'ISR10056165' OR mawb = '01692075922' LIMIT 1
  `);
  console.log(JSON.stringify(res.rows[0], null, 2));
  await client.end();
}
run().catch(console.error);
