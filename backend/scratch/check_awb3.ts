import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT status_code, occurred_at, location, payload->>'flight' as flight, remarks, pieces, payload->>'pieces' as payload_pieces
    FROM query_events
    WHERE mawb = '700-51239322'
    ORDER BY occurred_at ASC
  `);
  console.log("Events:", JSON.stringify(res.rows, null, 2));
  await client.end();
}
run().catch(console.error);
