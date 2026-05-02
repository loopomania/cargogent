import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const qs = await pool.query(`
    SELECT
      qs.mawb,
      qs.hawb,
      ls.summary->>'raw_meta' as raw_meta
    FROM query_schedule qs
    JOIN leg_status_summary ls 
      ON ls.tenant_id = qs.tenant_id 
      AND ls.shipment_id = COALESCE(qs.hawb, qs.mawb) 
      AND ls.leg_sequence = 1
    WHERE ls.aggregated_status = 'Partial Delivery'
  `);
  
  console.log(`Found ${qs.rows.length} partial deliveries.`);

  for (const row of qs.rows) {
      let expectedTotal = 0;
      let rawPieces = null;
      try {
          const rawMeta = typeof row.raw_meta === 'string' ? JSON.parse(row.raw_meta) : row.raw_meta;
          rawPieces = rawMeta?.pieces;
      } catch (e) {}

      const evs = await pool.query(`
        SELECT payload->>'pieces' as pieces, payload->>'actual_pieces' as actual_pieces, source
        FROM query_events
        WHERE mawb = $1 AND (hawb = $2 OR hawb IS NULL OR hawb = '')
          AND status_code = 'DLV'
      `, [row.mawb, row.hawb]);
      
      const dlvPieces = evs.rows.map(r => r.actual_pieces || r.pieces).filter(p => p).join(' + ');
      console.log(`- MAWB: ${row.mawb} | HAWB: ${row.hawb} | Expected: ${rawPieces} | DLV Events: ${evs.rows.length} | Delivered Pieces: [${dlvPieces}]`);
  }

  pool.end();
}
main().catch(console.error);
