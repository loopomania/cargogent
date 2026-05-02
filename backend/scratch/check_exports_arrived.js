import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  // Query shipments originating in Israel (export) 
  // that have an ARR status (or arrived) but not fully Delivered.
  const result = await pool.query(`
    SELECT
        ls.shipment_id,
        qs.mawb,
        qs.hawb,
        ls.aggregated_status,
        ls.summary->>'raw_meta' as raw_meta,
        ls.last_event_at
    FROM query_schedule qs
    JOIN leg_status_summary ls 
      ON ls.tenant_id = qs.tenant_id AND ls.shipment_id = COALESCE(qs.hawb, qs.mawb) AND ls.leg_sequence = 1
    WHERE qs.is_halted = false
      AND (
          (ls.summary->>'origin' = 'TLV') OR 
          (ls.summary->>'origin' = 'TEL AVIV') OR 
          (ls.summary->'raw_meta'->>'ground_query_method' IS NOT NULL AND qs.hawb LIKE 'ISR%')
      )
      AND ls.aggregated_status IN ('Arrived', 'Received from Flight', 'Notified for Delivery', 'Documents Delivered', 'Partial Delivery')
    ORDER BY ls.last_event_at DESC
  `);
  
  console.log(`Found ${result.rows.length} export shipments that are arrived but not delivered.`);
  
  const formatted = result.rows.map(r => {
      const raw = typeof r.raw_meta === 'string' ? JSON.parse(r.raw_meta) : r.raw_meta;
      const expectedPcs = raw?.pieces;
      const events = raw?.events || []; // events are not in raw_meta actually, they are in query_events
      return {
          mawb: r.mawb,
          hawb: r.hawb,
          status: r.aggregated_status,
          expected_pcs: expectedPcs,
          last_event_at: r.last_event_at
      };
  });
  console.table(formatted);

  pool.end();
}
main().catch(console.error);
