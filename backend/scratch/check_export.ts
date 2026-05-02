import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  const res = await client.query(`
    WITH dep_events AS (
        SELECT mawb, hawb, MIN(occurred_at) as first_dep_time
        FROM query_events
        WHERE status_code = 'DEP'
        GROUP BY mawb, hawb
    )
    SELECT 
        d.mawb,
        l.summary->>'origin' as origin,
        l.summary->>'destination' as dest
    FROM dep_events d
    LEFT JOIN query_events dl ON d.mawb = dl.mawb AND COALESCE(d.hawb, '') = COALESCE(dl.hawb, '') AND dl.status_code = 'DLV'
    LEFT JOIN leg_status_summary l ON COALESCE(d.hawb, d.mawb) = l.shipment_id
    WHERE dl.mawb IS NULL
      AND d.first_dep_time < NOW() - INTERVAL '3 days'
      AND COALESCE(l.aggregated_status, '') NOT IN ('Status DLV', 'Delivered')
      AND d.mawb LIKE '114%'
  `);
  
  let exportCount = 0;
  let importCount = 0;
  let unknownCount = 0;
  
  for (const row of res.rows) {
      const orig = (row.origin || '').toUpperCase();
      const dest = (row.dest || '').toUpperCase();
      
      if (orig.includes('TLV') || orig === 'ILTLV') {
          exportCount++;
      } else if (dest.includes('TLV') || dest === 'ILTLV') {
          importCount++;
      } else {
          unknownCount++;
          console.log(`Unknown direction: MAWB ${row.mawb}, Origin: ${orig}, Dest: ${dest}`);
      }
  }
  
  console.log(`--- Direction Breakdown (Total 53) ---`);
  console.log(`Export (Origin TLV): ${exportCount}`);
  console.log(`Import (Dest TLV): ${importCount}`);
  console.log(`Unknown/Third-party: ${unknownCount}`);
  
  await client.end();
}
run().catch(console.error);
