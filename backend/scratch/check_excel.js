import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'excel_transport_lines';
  `);
  console.log(res.rows.map(r => r.column_name));
  await client.end();
}
run().catch(console.error);
