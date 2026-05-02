import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  // Find how many there are first
  const check = await pool.query(`
    SELECT COUNT(*) as count
    FROM query_schedule
    WHERE error_count_consecutive >= 3 OR is_halted = true
  `);
  console.log(`Found ${check.rows[0].count} blocked/halted shipments to reschedule.`);

  if (check.rows[0].count > 0) {
      // Update them
      const result = await pool.query(`
        UPDATE query_schedule
        SET 
            error_count_consecutive = 0,
            is_halted = false,
            next_status_check_at = NOW()
        WHERE error_count_consecutive >= 3 OR is_halted = true
        RETURNING mawb, hawb
      `);
      console.log(`Successfully rescheduled ${result.rowCount} shipments to query ASAP.`);
      
      // Also update awb_latest_change to clear "Query Blocked" if needed? No, track/list derives it dynamically
  }

  pool.end();
}
main().catch(console.error);
