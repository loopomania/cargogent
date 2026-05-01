import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const res = await client.query(`
    WITH active_mawbs AS (
      SELECT DISTINCT mawb
      FROM query_schedule
    )
    SELECT substring(mawb from 1 for 3) as prefix, string_agg(mawb, ',') as mawbs
    FROM active_mawbs
    GROUP BY prefix
  `);
  console.log(res.rows);
  await client.end();
}
run().catch(console.error);
