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
    ),
    dlv_events AS (
        SELECT mawb, hawb
        FROM query_events
        WHERE status_code = 'DLV'
        GROUP BY mawb, hawb
    )
    SELECT 
        d.mawb, 
        d.hawb, 
        d.first_dep_time,
        EXTRACT(EPOCH FROM (NOW() - d.first_dep_time))/86400 as days_since_dep
    FROM dep_events d
    LEFT JOIN dlv_events dl ON d.mawb = dl.mawb AND COALESCE(d.hawb, '') = COALESCE(dl.hawb, '')
    WHERE dl.mawb IS NULL
      AND d.first_dep_time < NOW() - INTERVAL '3 days'
    ORDER BY days_since_dep DESC;
  `);
  
  console.log('--- Shipments not delivered > 3 days after DEP ---');
  console.log(`Total count: ${res.rows.length}`);
  if (res.rows.length > 0) {
      console.log('Top 10 oldest:');
      res.rows.slice(0, 10).forEach(r => {
          console.log(`- MAWB: ${r.mawb} | HAWB: ${r.hawb || 'N/A'} | DEP Time: ${r.first_dep_time.toISOString().split('T')[0]} | Days since DEP: ${Math.round(r.days_since_dep)}`);
      });
  }
  
  await client.end();
}
run().catch(console.error);
