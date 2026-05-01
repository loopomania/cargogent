import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const result = await pool.query(`
    SELECT
        qs.mawb,
        qs.hawb,
        ls.aggregated_status as status,
        qs.error_count_consecutive as errors,
        ls.last_event_at
    FROM query_schedule qs
    LEFT JOIN leg_status_summary ls 
      ON ls.tenant_id = qs.tenant_id AND ls.shipment_id = COALESCE(qs.hawb, qs.mawb) AND ls.leg_sequence = 1
    WHERE qs.error_count_consecutive >= 3 OR qs.is_halted = true
    ORDER BY qs.mawb ASC
  `);
  
  let md = "# Halted / 3+ Error Shipments\n\n";
  md += "| MAWB | HAWB | Status | Errors | Last Event Date |\n";
  md += "|------|------|--------|--------|-----------------|\n";
  
  for (const row of result.rows) {
    const d = row.last_event_at ? new Date(row.last_event_at).toISOString().split('T')[0] : 'N/A';
    md += `| ${row.mawb} | ${row.hawb || 'N/A'} | ${row.status || 'N/A'} | ${row.errors} | ${d} |\n`;
  }
  
  fs.writeFileSync('scratch/halted_list.md', md);
  console.log(`Generated list with ${result.rows.length} shipments.`);
  pool.end();
}
main().catch(console.error);
