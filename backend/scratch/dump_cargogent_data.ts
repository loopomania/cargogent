import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const mawbs = ['11463894854', '11463894832', '11463894821', '75250012550', '75250012546', '75250012535'];
  
  for (const mawb of mawbs) {
    const eventsRes = await pool.query(
      "SELECT payload FROM query_events WHERE mawb = $1 AND source = 'airline' ORDER BY created_at DESC LIMIT 1",
      [mawb]
    );
    
    // Also get all events to count legs/paths and check pieces/dates
    const allEventsRes = await pool.query(
      "SELECT payload FROM query_events WHERE mawb = $1 AND source = 'airline' ORDER BY created_at ASC",
      [mawb]
    );
    
    let lastStatus = 'Unknown';
    let lastMessage = 'Unknown';
    if (eventsRes.rows.length > 0) {
      const p = typeof eventsRes.rows[0].payload === 'string' ? JSON.parse(eventsRes.rows[0].payload) : eventsRes.rows[0].payload;
      lastStatus = p.status || p.status_code;
      lastMessage = p.message || p.remarks;
    }
    
    const allEvents = allEventsRes.rows.map(r => typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload);
    const pieces = allEvents.length > 0 ? allEvents[0].pieces : 'Unknown';
    
    // Dump what we have in CargoGent
    console.log(`MAWB: ${mawb}`);
    console.log(`  Last Status: ${lastStatus} | Message: ${lastMessage}`);
    console.log(`  Pieces: ${pieces}`);
    console.log(`  Event Count: ${allEvents.length}`);
    
    // We don't have the exact UI logic here, but we can dump the raw data we parsed.
    const lsRes = await pool.query(
      "SELECT summary FROM leg_status_summary WHERE mawb = $1 LIMIT 1",
      [mawb]
    );
    if (lsRes.rows.length > 0) {
      const sum = lsRes.rows[0].summary;
      console.log(`  ETD: ${sum.etd}, ATD: ${sum.atd}, ETA: ${sum.eta}, ATA: ${sum.ata}`);
    } else {
      console.log("  No leg_status_summary found for MAWB.");
    }
    console.log("-----------------------");
  }

  await pool.end();
}
run();
