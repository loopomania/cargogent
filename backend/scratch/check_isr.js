import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const isr = await pool.query(`
    SELECT qs.mawb, qs.hawb, qs.error_count_consecutive
    FROM query_schedule qs
    WHERE qs.hawb = 'ISR10055765'
  `);
  console.log("ISR10055765:", isr.rows);
  pool.end();
}
main().catch(console.error);
