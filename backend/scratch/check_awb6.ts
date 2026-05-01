import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT status_code, occurred_at, location, payload->>'flight' as flight, payload->>'pieces' as payload_pieces, payload->>'remarks' as remarks, source, provider
    FROM query_events
    WHERE mawb = '70051239322' AND hawb = 'ISR10056834'
    ORDER BY occurred_at ASC
  `);
  console.log("Events:", JSON.stringify(res.rows, null, 2));
  await client.end();
}
run().catch(console.error);
