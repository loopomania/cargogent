import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const qRes = await pool.query(
    "SELECT * FROM query_queue WHERE mawb = '11423202535' OR mawb = '114-23202535'"
  );
  console.log(qRes.rows);
  await pool.end();
}
run();
