import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const qs = await pool.query(`
    SELECT qs.mawb, qs.hawb, lss.aggregated_status
    FROM query_schedule qs
    JOIN leg_status_summary lss ON lss.tenant_id = qs.tenant_id AND lss.shipment_id = COALESCE(qs.hawb, qs.mawb)
    WHERE (qs.mawb LIKE '016%' OR qs.mawb LIKE '079%')
      AND lss.aggregated_status ILIKE '%partial%'
    LIMIT 10
  `);
  console.table(qs.rows);
  pool.end();
}
main().catch(console.error);
