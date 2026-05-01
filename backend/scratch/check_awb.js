import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const res = await pool.query(`
    SELECT id, awb, hawb, status, is_archived, latest_status_code, created_at, updated_at, stale_alert_sent
    FROM shipments
    WHERE awb LIKE '%016%92075841%'
  `);
  console.log("Shipments:", res.rows);
  
  if (res.rows.length > 0) {
      const shipmentId = res.rows[0].id;
      const legRes = await pool.query(`
          SELECT * FROM shipment_legs WHERE shipment_id = $1 ORDER BY sequence_order
      `, [shipmentId]);
      console.log("Legs:", legRes.rows);
      
      const statusRes = await pool.query(`
          SELECT * FROM awb_latest_status WHERE shipment_id = $1
      `, [shipmentId]);
      console.log("AWB Status cache:", statusRes.rows);
  }
  pool.end();
}
main().catch(console.error);
