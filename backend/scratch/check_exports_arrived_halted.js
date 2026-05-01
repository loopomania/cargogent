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
        ls.shipment_id,
        qs.mawb,
        qs.hawb,
        ls.aggregated_status,
        qs.is_halted,
        ls.last_event_at
    FROM query_schedule qs
    JOIN leg_status_summary ls 
      ON ls.tenant_id = qs.tenant_id AND ls.shipment_id = COALESCE(qs.hawb, qs.mawb) AND ls.leg_sequence = 1
    WHERE (
          (ls.summary->>'origin' = 'TLV') OR 
          (ls.summary->>'origin' = 'TEL AVIV') OR 
          (ls.summary->'raw_meta'->>'ground_query_method' IS NOT NULL AND qs.hawb LIKE 'ISR%')
      )
      AND ls.aggregated_status IN ('Arrived', 'Received from Flight', 'Notified for Delivery', 'Documents Delivered', 'Partial Delivery', 'ARR', 'AWD', 'NFD')
    ORDER BY ls.last_event_at DESC
  `);
  
  console.log(`Found ${result.rows.length} export shipments that are arrived but not delivered.`);
  console.table(result.rows);

  pool.end();
}
main().catch(console.error);
