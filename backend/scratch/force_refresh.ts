import { Client } from 'pg';
import dotenv from 'dotenv';
import { trackByAwb } from '../src/services/trackService.js';
import { saveTrackingResult } from '../src/routes/track.js';

dotenv.config({path: '../.env-prod'});

async function run() {
  const tenantId = '145d424b-325d-459f-864f-4d92e59e99a8'; // the tenant id, or we can get from db
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  // Get tenant ID for Cathay
  let res = await client.query(`SELECT tenant_id FROM query_schedule WHERE mawb = '16083499931' LIMIT 1`);
  const cathayTenant = res.rows[0]?.tenant_id;
  
  console.log("Tracking Cathay 160-83499931 (ISR10056000)...");
  let trackRes = await trackByAwb("160-83499931", "ISR10056000", false);
  console.log("Cathay Status:", trackRes.data.status, "| Events:", trackRes.data.events?.length);
  await saveTrackingResult(cathayTenant, "16083499931", "ISR10056000", trackRes.data);

  // Get tenant ID for Lufthansa
  res = await client.query(`SELECT tenant_id FROM query_schedule WHERE mawb = '02001360295' LIMIT 1`);
  const lufthansaTenant = res.rows[0]?.tenant_id || cathayTenant;
  
  console.log("Tracking Lufthansa 020-01360295 (ISR10055514)...");
  trackRes = await trackByAwb("020-01360295", "ISR10055514", false);
  console.log("Lufthansa Status:", trackRes.data.status, "| Events:", trackRes.data.events?.length);
  await saveTrackingResult(lufthansaTenant, "02001360295", "ISR10055514", trackRes.data);

  console.log("Done.");
  await client.end();
}
run().catch(console.error);
