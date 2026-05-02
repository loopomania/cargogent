import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const qs = await pool.query(`
    SELECT qs.mawb, qs.hawb, qs.error_count_consecutive, lss.aggregated_status, lss.summary->>'raw_meta' as raw_meta
    FROM query_schedule qs
    JOIN leg_status_summary lss ON lss.tenant_id = qs.tenant_id AND lss.shipment_id = COALESCE(qs.hawb, qs.mawb)
    WHERE qs.error_count_consecutive >= 3
  `);
  
  for (const row of qs.rows) {
    const raw = typeof row.raw_meta === 'string' ? JSON.parse(row.raw_meta) : row.raw_meta;
    console.log(`${row.mawb} / ${row.hawb} - pieces in raw_meta: ${raw?.pieces}`);
  }
  pool.end();
}
main().catch(console.error);
