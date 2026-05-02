import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  const res = await client.query(`
    UPDATE query_schedule
    SET next_status_check_at = NOW() - interval '1 minute'
    WHERE mawb = '16083499872'
  `);
  console.log(`Triggered ${res.rowCount} rows`);
  await client.end();
}
run().catch(console.error);
