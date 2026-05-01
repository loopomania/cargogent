import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const mawb = '01692075664';
  const hawb = 'ISR10055916';
  
  const res = await pool.query(`SELECT payload FROM query_events WHERE mawb = $1 ORDER BY created_at ASC`, [mawb]);
  for (const row of res.rows) {
     const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
     if (payload.status_code) {
        console.log(`[${payload.source || 'airline'}] ${payload.date} | ${payload.status_code} at ${payload.location} | Flt: ${payload.flight}`);
     }
  }

  await pool.end();
}
run();
