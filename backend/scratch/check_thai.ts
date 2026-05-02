import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const events = await pool.query(`
    SELECT status_text, count(*) 
    FROM query_events 
    WHERE provider = 'thai' 
    GROUP BY status_text
  `);
  console.log("Thai events by status:", events.rows);
  
  const summaries = await pool.query(`
    SELECT summary->>'message' as msg, count(*) 
    FROM leg_status_summary 
    WHERE summary->>'airline' = 'thai' 
    GROUP BY summary->>'message'
  `);
  console.log("Thai summaries by message:", summaries.rows);
  
  await pool.end();
}
run();
