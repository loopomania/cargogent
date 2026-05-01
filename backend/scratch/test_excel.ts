import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const byMawbHawb = `
       WITH target_shipment AS (
          SELECT shipment_id 
          FROM excel_transport_lines 
          WHERE master_awb = $1 AND house_ref = $2
          LIMIT 1
       )
       SELECT leg_sequence, leg_load_port, leg_discharge_port, leg_etd, leg_eta, first_leg_etd, israel_landing_eta 
       FROM excel_transport_lines 
       WHERE shipment_id = (SELECT shipment_id FROM target_shipment)
       ORDER BY leg_sequence ASC
    `;
    
  const res = await pool.query(byMawbHawb, ['01437625582', 'ISR10055923']);
  console.log("01437625582 + ISR10055923 excel lines:");
  console.log(res.rows);

  await pool.end();
}
run();
