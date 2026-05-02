import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const mawb = '01437625582';
  const hawb = 'ISR10055923';
  
  const tenantId = '00000000-0000-0000-0000-000000000000';
  const skipTenant = !tenantId || tenantId === '00000000-0000-0000-0000-000000000000';

  const byMawbHawb = skipTenant ? `
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
    ` : `
       WITH target_shipment AS (
          SELECT shipment_id 
          FROM excel_transport_lines 
          WHERE tenant_id = $1 AND master_awb = $2 AND house_ref = $3
          LIMIT 1
       )
       SELECT leg_sequence, leg_load_port, leg_discharge_port, leg_etd, leg_eta, first_leg_etd, israel_landing_eta 
       FROM excel_transport_lines 
       WHERE tenant_id = $1 AND shipment_id = (SELECT shipment_id FROM target_shipment)
       ORDER BY leg_sequence ASC
    `;

    const argsHawb = skipTenant ? [mawb.replace(/-/g, ""), hawb] : [tenantId, mawb.replace(/-/g, ""), hawb];
    
  let resExcel = await pool.query(byMawbHawb, argsHawb);
  console.log(resExcel.rows.length);
  await pool.end();
}
run();
