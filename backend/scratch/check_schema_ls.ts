import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const lsCols = await pool.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'leg_status_summary'
  `);
  console.log("leg_status_summary columns:", lsCols.rows.map(r => r.column_name).join(', '));
  
  await pool.end();
}
run();
