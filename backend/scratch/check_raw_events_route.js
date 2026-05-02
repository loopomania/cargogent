import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const events = await pool.query(`
      SELECT 
        id, 
        source, 
        status_code, 
        status_text, 
        location, 
        occurred_at, 
        created_at 
      FROM query_events 
      WHERE tenant_id = 'c8567554-4720-40e1-ad2e-8a2bf6de01c4' AND hawb = 'ISR10055949'
      ORDER BY occurred_at DESC
  `);
  console.log("\n--- raw events exactly as API returns them ---");
  console.table(events.rows);

  pool.end();
}
main().catch(console.error);
