import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT *
    FROM query_events
    WHERE query_id IN (
      SELECT id FROM awb_queries WHERE awb = '700-51239322'
    )
    ORDER BY created_at ASC
  `);
  console.log("Events:", JSON.stringify(res.rows, null, 2));
  await client.end();
}
run().catch(console.error);
