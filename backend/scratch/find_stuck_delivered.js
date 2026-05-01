import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // Find all shipments currently in query_schedule that have a 'Delivered' status
  const qs = await pool.query(`
    SELECT
      qs.tenant_id,
      qs.mawb,
      qs.hawb,
      ls.aggregated_status,
      ls.summary->>'raw_meta' as raw_meta
    FROM query_schedule qs
    JOIN leg_status_summary ls 
      ON ls.tenant_id = qs.tenant_id 
      AND ls.shipment_id = COALESCE(qs.hawb, qs.mawb) 
      AND ls.leg_sequence = 1
    WHERE ls.aggregated_status = 'Delivered'
  `);
  
  console.log(`Found ${qs.rows.length} shipments in query_schedule with 'Delivered' status.`);

  for (const row of qs.rows) {
      let expectedTotal = 0;
      let rawPieces = null;
      try {
          const rawMeta = typeof row.raw_meta === 'string' ? JSON.parse(row.raw_meta) : row.raw_meta;
          rawPieces = rawMeta?.pieces;
      } catch (e) {}

      // Get DLV events for this shipment
      const evs = await pool.query(`
        SELECT status_code, pieces, source
        FROM query_events
        WHERE mawb = $1 AND (hawb = $2 OR hawb IS NULL OR hawb = '')
          AND status_code = 'DLV'
      `, [row.mawb, row.hawb]);
      
      console.log(`- MAWB: ${row.mawb} | HAWB: ${row.hawb} | Expected: ${rawPieces} | DLV Events: ${evs.rows.length}`);
      if (evs.rows.length > 0) {
          console.log(`    DLV pieces: ${evs.rows.map(r => r.pieces).join(', ')}`);
      }
  }

  pool.end();
}
main().catch(console.error);
