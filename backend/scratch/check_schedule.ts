import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT hawb, error_count_consecutive, is_halted, ground_only
    FROM query_schedule 
    WHERE mawb = '16083499931'
  `);
  console.log(res.rows);
  await client.end();
}
run().catch(console.error);
