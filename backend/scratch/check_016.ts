import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const mawb = '01692075664';
  const hawb = 'ISR10055916';
  
  // 1. Check leg_status_summary
  const lsRes = await pool.query(
    "SELECT summary FROM leg_status_summary WHERE shipment_id = $1",
    [hawb]
  );
  if (lsRes.rows.length > 0) {
    console.log("=== leg_status_summary ===");
    console.log(JSON.stringify(lsRes.rows[0].summary, null, 2));
  } else {
    console.log("No leg_status_summary found.");
  }

  // 2. Check query_events (latest airline event)
  const evRes = await pool.query(
    "SELECT payload FROM query_events WHERE mawb = $1 AND source = 'airline' ORDER BY created_at DESC LIMIT 1",
    [mawb]
  );
  if (evRes.rows.length > 0) {
    console.log("=== query_events (latest airline) ===");
    const payload = evRes.rows[0].payload;
    console.log(JSON.stringify(typeof payload === 'string' ? JSON.parse(payload) : payload, null, 2));
  } else {
    console.log("No airline events found.");
  }

  // 3. Check excel_transport_lines
  const xlRes = await pool.query(
    "SELECT * FROM excel_transport_lines WHERE master_awb = $1 AND house_ref = $2 ORDER BY leg_sequence ASC",
    [mawb, hawb]
  );
  if (xlRes.rows.length > 0) {
    console.log("=== excel_transport_lines ===");
    console.log(JSON.stringify(xlRes.rows.map(r => ({ seq: r.leg_sequence, from: r.leg_load_port, to: r.leg_discharge_port, flight: r.flight_number })), null, 2));
  }

  await pool.end();
}
run();
