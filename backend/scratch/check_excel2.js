import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const unknownSamples = await pool.query(`
    SELECT ls.shipment_id, ls.aggregated_status, qs.is_halted, qs.error_count_consecutive
    FROM leg_status_summary ls
    LEFT JOIN query_schedule qs ON qs.hawb = ls.shipment_id OR qs.mawb = ls.shipment_id
    WHERE ls.aggregated_status ILIKE '%unknown%' OR ls.aggregated_status ILIKE '%no status%'
    LIMIT 20
  `);
  console.log("Unknown/No Status Samples:", unknownSamples.rows);
  
  const allStatus = await pool.query(`
    SELECT aggregated_status, count(*) as count
    FROM leg_status_summary
    GROUP BY aggregated_status
    ORDER BY count DESC
    LIMIT 10
  `);
  console.log("Global Status Count:", allStatus.rows);

  pool.end();
}
main().catch(console.error);
