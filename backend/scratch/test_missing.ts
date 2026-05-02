import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const mawb = '21707891354';
  
  const summary = await pool.query(
      "SELECT * FROM leg_status_summary WHERE shipment_id LIKE $1 OR shipment_id = $2 LIMIT 1",
      [`%${mawb}%`, mawb]
    );
  console.log("Summary:", JSON.stringify(summary.rows, null, 2));
  
  const events = await pool.query("SELECT COUNT(*) FROM query_events WHERE mawb = $1", [mawb]);
  console.log("Events count:", events.rows[0].count);

  const excel = await pool.query("SELECT * FROM excel_transport_lines WHERE master_awb = $1", [mawb]);
  console.log("Excel lines:", excel.rows.length);
  if (excel.rows.length > 0) {
     console.log(JSON.stringify(excel.rows.map(r => ({ from: r.leg_load_port, to: r.leg_discharge_port, seq: r.leg_sequence })), null, 2));
  }
  
  await pool.end();
}
run();
