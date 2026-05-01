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
        ls.aggregated_status,
        ls.summary->>'raw_meta' as raw_meta
    FROM query_schedule qs
    JOIN leg_status_summary ls 
      ON ls.tenant_id = qs.tenant_id AND ls.shipment_id = COALESCE(qs.hawb, qs.mawb) AND ls.leg_sequence = 1
    WHERE (
          (ls.summary->>'origin' = 'TLV') OR 
          (ls.summary->>'origin' = 'TEL AVIV') OR 
          (ls.summary->'raw_meta'->>'ground_query_method' IS NOT NULL AND qs.hawb LIKE 'ISR%')
      )
      AND ls.aggregated_status IN ('Arrived', 'Received from Flight', 'Notified for Delivery', 'Documents Delivered', 'Partial Delivery', 'ARR', 'AWD', 'NFD')
  `);
  
  const formatted = result.rows.map(r => {
      const raw = typeof r.raw_meta === 'string' ? JSON.parse(r.raw_meta) : r.raw_meta;
      const legs = raw?.excel_legs || [];
      const finalLeg = legs.length > 0 ? legs[legs.length - 1] : null;
      
      return {
          hawb: r.shipment_id,
          mawb: r.mawb,
          status: r.aggregated_status,
          final_dest: finalLeg?.to || 'Unknown',
          has_ata: finalLeg?.eta != null,
          eta_val: finalLeg?.eta
      };
  });
  console.table(formatted);

  pool.end();
}
main().catch(console.error);
