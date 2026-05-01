import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const res = await client.query(`SELECT count(*) FROM query_schedule`);
  console.log("Total in query_schedule:", res.rows[0].count);
  
  const res2 = await client.query(`SELECT count(*) FROM query_schedule WHERE is_halted = true`);
  console.log("Total halted:", res2.rows[0].count);
  
  const res3 = await client.query(`
    UPDATE query_schedule
    SET is_halted = false,
        error_count_consecutive = 0,
        next_status_check_at = NOW() + (random() * interval '60 minutes')
  `);
  console.log("Updated rows:", res3.rowCount);
  await client.end();
}
run().catch(console.error);
