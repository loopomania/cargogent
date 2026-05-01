import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const triggers = await pool.query(`
    SELECT event_object_table, trigger_name, action_statement
    FROM information_schema.triggers
    WHERE event_object_table = 'excel_transport_lines'
  `);
  console.log("Triggers:", triggers.rows);
  pool.end();
}
main().catch(console.error);
