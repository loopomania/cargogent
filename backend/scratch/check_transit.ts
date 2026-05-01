import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT *
    FROM transit_flights
    WHERE hawb = 'ISR10056311'
  `);
  console.log("Transit flights:", JSON.stringify(res.rows, null, 2));
  await client.end();
}
run().catch(console.error);
