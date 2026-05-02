import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  // We can just update the updated_at or status to force it
  await client.query("UPDATE leg_status_summary SET next_check_at = NOW() - interval '1 hour' WHERE mawb = '07950938333'");
  await client.end();
  
  const res = await fetch('http://localhost:3000/api/track/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mawb: '07950938333' })
  });
  console.log("SYNC HTTP:", res.status, await res.text());
}
run().catch(console.error);
