import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT shipment_id, summary->>'mawb' as mawb, aggregated_status, jsonb_array_length(summary->'paths') as path_count
    FROM leg_status_summary
    WHERE jsonb_array_length(summary->'paths') > 1
    ORDER BY path_count DESC, updated_at DESC
  `);
  
  console.log(`--- Shipments with Multiple Paths (${res.rows.length} total) ---`);
  
  // Group by MAWB prefix to see if there's a pattern
  const prefixCounts: Record<string, number> = {};
  
  res.rows.forEach(r => {
      const prefix = r.mawb ? r.mawb.substring(0, 3) : 'UNK';
      prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
      
      // Print first 20
      if (res.rows.indexOf(r) < 20) {
        console.log(`- MAWB: ${r.mawb} | HAWB: ${r.shipment_id !== r.mawb ? r.shipment_id : 'N/A'} | Paths: ${r.path_count} | Status: ${r.aggregated_status}`);
      }
  });
  
  if (res.rows.length > 20) {
      console.log(`... and ${res.rows.length - 20} more.`);
  }
  
  console.log(`\n--- Breakdown by Airline Prefix ---`);
  Object.entries(prefixCounts).sort((a, b) => b[1] - a[1]).forEach(([prefix, count]) => {
      console.log(`${prefix}: ${count} shipments`);
  });
  
  await client.end();
}
run().catch(console.error);
