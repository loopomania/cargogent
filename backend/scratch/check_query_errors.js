import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const res = await pool.query(`
    SELECT created_at, awb, error_message
    FROM query_logs
    WHERE status = 'ERROR' OR error_message IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 20
  `);
  console.log(`Found ${res.rows.length} error logs:`);
  res.rows.forEach(r => console.log(`${r.created_at.toISOString()} | AWB: ${r.awb} | Error: ${r.error_message}`));
  
  // Also get a summary of errors by awb prefix
  const summary = await pool.query(`
    SELECT substring(awb, 1, 3) as prefix, count(*) as count, max(error_message) as sample_error
    FROM query_logs
    WHERE status = 'ERROR' AND created_at > NOW() - interval '1 day'
    GROUP BY prefix
    ORDER BY count DESC
  `);
  console.log("\nError Summary by Prefix (Last 24h):");
  summary.rows.forEach(r => console.log(`${r.prefix}: ${r.count} errors. Sample: ${r.sample_error}`));
  
  pool.end();
}
main().catch(console.error);
