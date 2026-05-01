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
    SELECT d.mawb
    FROM dep_events d
    LEFT JOIN query_events dl ON d.mawb = dl.mawb AND COALESCE(d.hawb, '') = COALESCE(dl.hawb, '') AND dl.status_code = 'DLV'
    LEFT JOIN leg_status_summary l ON COALESCE(d.hawb, d.mawb) = l.shipment_id
    WHERE dl.mawb IS NULL
      AND d.first_dep_time < NOW() - INTERVAL '3 days'
      AND COALESCE(l.aggregated_status, '') NOT IN ('Status DLV', 'Delivered')
      AND d.mawb LIKE '114%'
  `);
  
  console.log(res.rows.map(r => r.mawb).join(','));
  await client.end();
}
run().catch(console.error);
