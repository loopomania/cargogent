import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const res = await pool.query(`
    UPDATE query_schedule
    SET is_halted = false, error_count_consecutive = 0, next_status_check_at = NOW()
    WHERE is_halted = true OR error_count_consecutive > 0
    RETURNING mawb, hawb
  `);
  console.log(`Unhalted and reset ${res.rowCount} shipments.`);
  await pool.end();
}
run();
