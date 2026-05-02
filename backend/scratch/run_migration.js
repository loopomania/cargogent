import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  await pool.query(`
    ALTER TABLE query_schedule 
    ADD COLUMN IF NOT EXISTS ground_only BOOLEAN DEFAULT FALSE;
  `);
  console.log("Migration applied successfully!");
  pool.end();
}
main().catch(console.error);
