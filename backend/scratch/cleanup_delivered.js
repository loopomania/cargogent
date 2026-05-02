import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const res = await pool.query(`
    DELETE FROM query_schedule q
    USING leg_status_summary l
    WHERE l.tenant_id = q.tenant_id 
      AND l.shipment_id = COALESCE(q.hawb, q.mawb) 
      AND l.leg_sequence = 1
      AND l.aggregated_status IN ('Status DLV', 'Delivered')
  `);
  console.log("Deleted delivered rows from query_schedule:", res.rowCount);
  pool.end();
}
main().catch(console.error);
