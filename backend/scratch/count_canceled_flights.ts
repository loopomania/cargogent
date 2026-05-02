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
    "SELECT mawb, payload FROM query_events WHERE source = 'airline' ORDER BY created_at ASC"
  );
  
  const shipments = {};
  for (const row of eventsRes.rows) {
      if (!shipments[row.mawb]) shipments[row.mawb] = [];
      const ev = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
      shipments[row.mawb].push(ev);
  }

  let canceledFlightCount = 0;
  const canceledCases = [];

  for (const mawb of Object.keys(shipments)) {
     const events = shipments[mawb];
     if (events.length === 0) continue;

     // Check if the shipment has started moving at all
     const shipmentHasTransit = events.some(e => ['DEP', 'ARR', 'MAN', 'RCF'].includes(e.status_code));
     if (!shipmentHasTransit) continue; 

     const flights = Array.from(new Set(events.map(e => normalizeFlight(e.flight)).filter(Boolean)));
     
     const canceledForThisShipment = [];
     for (const flt of flights) {
         const evsForFlt = events.filter(e => normalizeFlight(e.flight) === flt);
         
         // 1. Explicitly 0 pieces from tracker (if deployed and ran)
         const explicitlyZero = evsForFlt.some(e => Number(e.pieces) === 0);
         
         // 2. Flight has BKD/RCS/DIS but no transit
         const hasTransit = evsForFlt.some(e => ['DEP', 'ARR', 'MAN', 'RCF'].includes(e.status_code));
         
         if (explicitlyZero || !hasTransit) {
             canceledForThisShipment.push(flt);
             canceledFlightCount++;
         }
     }

     if (canceledForThisShipment.length > 0) {
         canceledCases.push({
             mawb,
             canceledFlights: canceledForThisShipment
         });
     }
  }

  console.log(`\nFound ${canceledCases.length} shipments containing a total of ${canceledFlightCount} canceled/unloaded flights.`);
  if (canceledCases.length > 0) {
      console.log(`\nDetails:`);
      canceledCases.forEach(c => {
          console.log(`- MAWB ${c.mawb}: Canceled flights -> ${c.canceledFlights.join(', ')}`);
      });
  }
  
  await pool.end();
}
run();
