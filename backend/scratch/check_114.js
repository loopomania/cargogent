import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const events = await pool.query(`
    SELECT source, status_code, status_text, location, occurred_at, payload->>'flight' as flight
    FROM query_events
    WHERE mawb = '11463894014' AND hawb = 'ISR10055949'
    ORDER BY occurred_at ASC
  `);
  console.log("\n--- query_events for 11463894014 ---");
  console.table(events.rows);

  const ls = await pool.query(`
    SELECT aggregated_status, last_event_at, summary->>'events_count' as ev_count
    FROM leg_status_summary
    WHERE shipment_id = 'ISR10055949'
  `);
  console.log("\n--- leg_status_summary ---");
  console.table(ls.rows);

  pool.end();
}
main().catch(console.error);
