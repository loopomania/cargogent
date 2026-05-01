import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  await pool.query(`
    UPDATE leg_status_summary 
    SET aggregated_status = 'Status DLV', last_event_list_hash = '10-Delivered', updated_at = NOW()
    WHERE shipment_id = 'STLV0146801' OR shipment_id = '11463893690'
  `);
  console.log("Updated El Al to Status DLV");
  pool.end();
}
main().catch(console.error);
