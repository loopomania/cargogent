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
  
  for (const row of res.rows) {
    const events = row.events;
    let hasAirlineEvent = false;
    for (const e of events) {
       const isGround = e.source === 'maman' || e.source === 'swissport' || (e.payload && e.payload.remarks && (e.payload.remarks.toLowerCase().includes('maman') || e.payload.remarks.toLowerCase().includes('swissport')));
       if (!isGround) {
          hasAirlineEvent = true;
          break;
       }
    }
    
    if (!hasAirlineEvent) {
      console.log(`Shipment ${row.mawb}/${row.hawb} has ONLY ground events. Let's trace it.`);
      break; // Just need 1
    }
  }
  
  await client.end();
}
run().catch(console.error);
