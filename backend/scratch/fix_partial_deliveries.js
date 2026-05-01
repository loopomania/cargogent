import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log("Updating shipments to Delivered and removing from query_schedule...");
  
  const shipmentsToFix = ['ISR10056087', 'ISR10056099', 'ISR10055962', 'ISR10055340'];
  
  for (const shipment of shipmentsToFix) {
      await pool.query(`
        UPDATE leg_status_summary
        SET aggregated_status = 'Delivered'
        WHERE shipment_id = $1
      `, [shipment]);
      
      await pool.query(`
        DELETE FROM query_schedule
        WHERE hawb = $1 OR (mawb = $1 AND (hawb IS NULL OR hawb = ''))
      `, [shipment]);
      
      console.log(`- Fixed ${shipment}`);
  }
  
  pool.end();
}
main().catch(console.error);
