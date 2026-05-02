import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const errors = await pool.query(`
    SELECT qs.mawb, qs.hawb, qs.error_count_consecutive, qs.is_halted, ls.aggregated_status
    FROM query_schedule qs
    LEFT JOIN leg_status_summary ls ON ls.shipment_id = qs.hawb OR ls.shipment_id = qs.mawb
    WHERE qs.error_count_consecutive > 0
    ORDER BY qs.error_count_consecutive DESC
  `);
  console.log("Shipments with errors:", errors.rows);
  pool.end();
}
main().catch(console.error);
