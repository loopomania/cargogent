import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  await pool.query(`
    UPDATE leg_status_summary
    SET aggregated_status = 'Partial Delivery'
    WHERE shipment_id = 'ISR10056087'
  `);
  console.log("Updated 01692075841 / ISR10056087 to Partial Delivery");
  pool.end();
}
main().catch(console.error);
