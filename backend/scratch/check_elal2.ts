import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT q.mawb, q.hawb, json_agg(q.*) as events
    FROM query_events q
    WHERE q.mawb LIKE '114%'
    GROUP BY q.mawb, q.hawb
  `);
  
  let total = 0;
  let missingDepArr = 0;
  let onlyGroundEvents = 0;
  
  for (const row of res.rows) {
    total++;
    const events = row.events;
    
    let hasDep = events.some(e => e.status_code === 'DEP');
    let hasArr = events.some(e => e.status_code === 'ARR');
    
    // Check if there are any events NOT originating from maman/swissport
    let hasAirlineEvent = false;
    for (const e of events) {
       const isGround = e.source === 'maman' || e.source === 'swissport' || (e.payload && e.payload.remarks && (e.payload.remarks.toLowerCase().includes('maman') || e.payload.remarks.toLowerCase().includes('swissport')));
       if (!isGround) {
          hasAirlineEvent = true;
          break;
       }
    }
    
    if (!hasAirlineEvent) {
      onlyGroundEvents++;
      // console.log(`Shipment ${row.mawb}/${row.hawb} has ONLY ground events.`);
    } else if (!hasDep && !hasArr) {
      missingDepArr++;
      console.log(`Shipment ${row.mawb}/${row.hawb} has airline events but NO DEP/ARR. Events:`, events.filter(e => e.source !== 'maman' && e.source !== 'swissport').map(e => e.status_code));
    }
  }
  
  console.log('--- Summary of El Al Shipments in query_events ---');
  console.log('Total checked:', total);
  console.log('Only ground events (missing airline data):', onlyGroundEvents);
  console.log('Has airline events but missing DEP/ARR milestones:', missingDepArr);
  
  await client.end();
}
run().catch(console.error);
