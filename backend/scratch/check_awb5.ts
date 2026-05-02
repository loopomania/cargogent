import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT DISTINCT mawb FROM query_events WHERE mawb LIKE '700%'
  `);
  console.log("AWBs:", JSON.stringify(res.rows, null, 2));
  await client.end();
}
run().catch(console.error);
