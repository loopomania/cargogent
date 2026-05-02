import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const q = await pool.query(`
    SELECT qs.error_count_consecutive, ls.aggregated_status
    FROM query_schedule qs
    LEFT JOIN leg_status_summary ls ON ls.shipment_id = qs.hawb OR ls.shipment_id = qs.mawb
    WHERE qs.mawb = '11463893690'
  `);
  console.log("El Al 11463893690:", q.rows);
  pool.end();
}
main().catch(console.error);
