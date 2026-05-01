import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const res = await pool.query(`
    SELECT
      qs.mawb,
      qs.hawb,
      CASE WHEN qs.error_count_consecutive >= 3 THEN 'Query Blocked' ELSE ls.aggregated_status END as status,
      ls.last_event_at::text as last_update,
      (ls.last_event_at < NOW() - INTERVAL '24 hours' OR ls.last_event_at IS NULL) as stale_24h,
      (qs.error_count_consecutive >= 3) as error_halt
    FROM query_schedule qs
    LEFT JOIN leg_status_summary ls 
      ON ls.tenant_id = qs.tenant_id AND ls.shipment_id = COALESCE(qs.hawb, qs.mawb) AND ls.leg_sequence = 1
    WHERE (ls.last_event_at < NOW() - INTERVAL '24 hours' OR ls.last_event_at IS NULL OR qs.error_count_consecutive >= 3)
    ORDER BY ls.last_event_at ASC NULLS FIRST
  `);
  console.log(`Found ${res.rows.length} shipments needing attention.`);
  res.rows.forEach(r => console.log(`${r.mawb} / ${r.hawb || 'NONE'} | Status: ${r.status} | Last Event: ${r.last_update}`));
  pool.end();
}
main().catch(console.error);
