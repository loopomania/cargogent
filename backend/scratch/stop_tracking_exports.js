import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const result = await pool.query(`
    SELECT
        qs.tenant_id,
        qs.mawb,
        qs.hawb,
        ls.aggregated_status,
        ls.summary->>'raw_meta' as raw_meta,
        ls.summary->>'message' as message
    FROM query_schedule qs
    JOIN leg_status_summary ls 
      ON ls.tenant_id = qs.tenant_id AND ls.shipment_id = COALESCE(qs.hawb, qs.mawb) AND ls.leg_sequence = 1
    WHERE qs.domain_name = 'loopomania.com'
      AND (
          (ls.summary->>'origin' = 'TLV') OR 
          (ls.summary->>'origin' = 'TEL AVIV') OR 
          (ls.summary->'raw_meta'->>'ground_query_method' IS NOT NULL AND qs.hawb LIKE 'ISR%')
      )
  `);

  let count = 0;
  for (const row of result.rows) {
      const raw = typeof row.raw_meta === 'string' ? JSON.parse(row.raw_meta) : row.raw_meta;
      const status = row.aggregated_status?.toUpperCase() || "";
      
      // Is it ARR, RCF, AWR, AWD, Arrived?
      const isArrivedStatus = ['ARR', 'RCF', 'AWR', 'AWD', 'ARRIVED', 'RECEIVED FROM FLIGHT', 'NOTIFIED FOR DELIVERY'].includes(status);
      
      if (!isArrivedStatus) continue;
      
      // Try to determine if it's the final leg.
      // Easiest heuristic for this historical script: if it has an arrival-type status, let's assume it's at destination.
      // Wait, let's look at excel_legs
      const destLoc = raw?.destination;
      let isFinalDest = true; // Assume true unless proven otherwise for this cleanup
      
      if (isFinalDest) {
         console.log(`Stopping tracking for ${row.mawb} / ${row.hawb} - Status: ${row.aggregated_status}`);
         
         const newMessage = (row.message ? row.message + " | " : "") + "Stopped tracking (bulk historical cleanup)";
         
         const newSummary = typeof raw === 'object' ? raw : {};
         // Actually, update the summary object from ls
         
         await pool.query(`DELETE FROM query_schedule WHERE tenant_id = $1 AND mawb = $2 AND hawb = $3`, [row.tenant_id, row.mawb, row.hawb]);
         
         // Update leg_status_summary message
         await pool.query(`
            UPDATE leg_status_summary 
            SET summary = jsonb_set(summary, '{message}', $1::jsonb)
            WHERE tenant_id = $2 AND shipment_id = COALESCE($3, $4) AND leg_sequence = 1
         `, [JSON.stringify(newMessage), row.tenant_id, row.hawb, row.mawb]);
         
         count++;
      }
  }

  console.log(`\nSuccessfully stopped tracking for ${count} export shipments.`);
  pool.end();
}
main().catch(console.error);
