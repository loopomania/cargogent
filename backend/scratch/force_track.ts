import { trackByAwb } from '../src/routes/track';
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  // We need to fetch the tenant_id and hawb, or we can just pass null tenant and the backend will upsert it?
  // Let's just run trackByAwb manually.
  await trackByAwb(client, 'cf303107-16ca-4c81-81d3-cd7dae1d7a31', '16083499872', 'ISR10056003', 'cargogent.com', null);
  console.log("Track complete.");
  await client.end();
}
run().catch(console.error);
