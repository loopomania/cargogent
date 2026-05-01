import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const q = await pool.query(`SELECT * FROM query_schedule WHERE mawb = '11463893690'`);
  console.log("Schedule:", q.rows);
  pool.end();
}
main().catch(console.error);
