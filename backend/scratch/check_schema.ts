import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const qsCols = await pool.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'query_schedule'
  `);
  console.log("query_schedule columns:", qsCols.rows.map(r => r.column_name).join(', '));
  
  await pool.end();
}
run();
