import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const result1 = await pool.query(`
    SELECT
        COUNT(*) as total_3plus,
        COUNT(*) FILTER (WHERE ls.aggregated_status = 'Delivered') as delivered_count,
        COUNT(*) FILTER (WHERE ls.aggregated_status = 'Partial Delivery') as partial_count,
        COUNT(*) FILTER (WHERE ls.aggregated_status NOT IN ('Delivered', 'Partial Delivery')) as other_count
    FROM query_schedule qs
    LEFT JOIN leg_status_summary ls 
      ON ls.tenant_id = qs.tenant_id AND ls.shipment_id = COALESCE(qs.hawb, qs.mawb) AND ls.leg_sequence = 1
    WHERE qs.error_count_consecutive >= 3
  `);
  
  const result2 = await pool.query(`
    SELECT
        COUNT(*) as total_halted,
        COUNT(*) FILTER (WHERE error_count_consecutive >= 3) as with_3plus_errors,
        COUNT(*) FILTER (WHERE error_count_consecutive < 3) as without_3plus_errors
    FROM query_schedule
    WHERE is_halted = true
  `);
  
  const airlines = await pool.query(`
    SELECT 
        substring(qs.mawb, 1, 3) as prefix, 
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE ls.aggregated_status = 'Delivered') as delivered_count
    FROM query_schedule qs
    LEFT JOIN leg_status_summary ls 
      ON ls.tenant_id = qs.tenant_id AND ls.shipment_id = COALESCE(qs.hawb, qs.mawb) AND ls.leg_sequence = 1
    WHERE qs.error_count_consecutive >= 3
    GROUP BY prefix
    ORDER BY count DESC
  `);

  console.log("\n--- Analysis of 3+ Errors ---");
  console.table(result1.rows);
  
  console.log("\n--- Analysis of Halted Shipments ---");
  console.table(result2.rows);
  
  console.log("\n--- Breakdown by Airline Prefix (3+ Errors) ---");
  console.table(airlines.rows);

  pool.end();
}
main().catch(console.error);
