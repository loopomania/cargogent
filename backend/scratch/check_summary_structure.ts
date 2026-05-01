import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT summary
    FROM leg_status_summary
    LIMIT 1
  `);
  
  console.log(JSON.stringify(res.rows[0].summary, null, 2));
  
  await client.end();
}
run().catch(console.error);
