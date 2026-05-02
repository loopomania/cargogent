import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  await client.query(`DELETE FROM query_schedule WHERE mawb = '16083499872'`);
  const res = await client.query(`
    INSERT INTO query_schedule (tenant_id, mawb, hawb, next_status_check_at, last_check_at, domain_name)
    VALUES ('cf303107-16ca-4c81-81d3-cd7dae1d7a31', '16083499872', 'ISR10056003', NOW() - interval '1 minute', NOW(), 'cargogent.com')
  `);
  console.log(`Inserted ${res.rowCount} rows`);
  await client.end();
}
run().catch(console.error);
