import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env-prod') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const result = await pool.query("SELECT * FROM query_logs WHERE awb_number = '160-83499721' ORDER BY started_at DESC LIMIT 5");
  console.log("QUERY LOGS:");
  console.log(JSON.stringify(result.rows, null, 2));
  
  const result2 = await pool.query("SELECT * FROM awb_latest_status WHERE awb_number = '160-83499721'");
  console.log("AWB LATEST STATUS:");
  console.log(JSON.stringify(result2.rows, null, 2));

  const result3 = await pool.query("SELECT * FROM leg_status_summary WHERE awb_number = '160-83499721'");
  console.log("LEG STATUS SUMMARY:");
  console.log(JSON.stringify(result3.rows, null, 2));
  process.exit(0);
}

main();
