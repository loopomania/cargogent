import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const q = await pool.query(`
    SELECT qs.mawb, qs.hawb, qs.error_count_consecutive, ls.aggregated_status, ls.last_event_list_hash
    FROM query_schedule qs
    LEFT JOIN leg_status_summary ls ON ls.shipment_id = qs.hawb OR ls.shipment_id = qs.mawb
    WHERE qs.mawb IN ('11463893690', '21707891380', '01692075664')
  `);
  console.log("Current status:", q.rows);
  pool.end();
}
main().catch(console.error);
