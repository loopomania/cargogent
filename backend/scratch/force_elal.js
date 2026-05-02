import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const result = await pool.query(`
    UPDATE query_schedule
    SET next_status_check_at = NOW(),
        last_check_at = NOW() - interval '1 hour'
    WHERE mawb = '11463894014' AND hawb = 'ISR10055949'
    RETURNING mawb
  `);
  console.log(`Forced re-query for ${result.rowCount} EL AL shipments.`);
  pool.end();
}
main().catch(console.error);
