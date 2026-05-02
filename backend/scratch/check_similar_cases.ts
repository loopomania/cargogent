import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

function normalizeFlight(f) {
  if (!f) return null;
  const m = f.replace(/\s+/g, '').toUpperCase().match(/^([A-Z]{2,3})0*(\d{1,4})$/);
  return m ? `${m[1]}${m[2]}` : f.replace(/\s+/g, '').toUpperCase();
}

async function run() {
  const eventsRes = await pool.query(
    "SELECT mawb, payload, created_at FROM query_events WHERE source = 'airline' ORDER BY created_at ASC"
  );
  
  const shipments = {};
  for (const row of eventsRes.rows) {
      if (!shipments[row.mawb]) shipments[row.mawb] = [];
      shipments[row.mawb].push(row);
  }

  console.log(`Analyzing ${Object.keys(shipments).length} shipments for anomalies...`);

  let anomalyCount = 0;
  for (const mawb of Object.keys(shipments)) {
     const rows = shipments[mawb];
     // get the latest payload
     const latestRow = rows[rows.length - 1];
     const payload = typeof latestRow.payload === 'string' ? JSON.parse(latestRow.payload) : latestRow.payload;
     const events = payload.events || [];
     
     if (events.length === 0) continue;

     const flights = Array.from(new Set(events.map(e => normalizeFlight(e.flight)).filter(Boolean)));
     
     // 1. Check for multiple airline prefixes (partner re-routing)
     const prefixes = Array.from(new Set(flights.map(f => f.replace(/[0-9]/g, ''))));
     
     // 2. Check for flights that ONLY have BKD/RCS/DIS (failed or future legs)
     const failedFlights = [];
     for (const flt of flights) {
         const evsForFlt = events.filter(e => normalizeFlight(e.flight) === flt);
         const hasDepArr = evsForFlt.some(e => ['DEP', 'ARR', 'MAN', 'RCF'].includes(e.status_code));
         const hasDis = evsForFlt.some(e => ['DIS', 'BKD', 'RCS'].includes(e.status_code));
         if (!hasDepArr && hasDis) {
             // Check if it's purely a future flight? If all events are in the future, it's not failed, just pending.
             // If there's another flight with DEP/ARR that happened AFTER the DIS date, it's a failed flight!
             failedFlights.push(flt);
         }
     }

     if (prefixes.length > 1 || failedFlights.length > 0) {
         console.log(`\n--- MAWB: ${mawb} ---`);
         console.log(`Flights involved: ${flights.join(', ')}`);
         console.log(`Airline prefixes: ${prefixes.join(', ')}`);
         console.log(`Potentially failed/unflown flights: ${failedFlights.join(', ') || 'None'}`);
         
         // Print chronological trace
         for (const e of events) {
            console.log(`  [${e.date}] ${e.status_code} at ${e.location} | Flt: ${e.flight} | Pcs: ${e.pieces}`);
         }
         anomalyCount++;
     }
  }
  
  console.log(`\nFound ${anomalyCount} shipments with complex multi-airline or potentially unflown flights.`);
  await pool.end();
}
run();
