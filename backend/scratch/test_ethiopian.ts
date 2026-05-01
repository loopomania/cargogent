import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
import { trackByAwb } from './dist/services/trackService.js';

async function run() {
  console.log("Tracking Ethiopian...");
  const trackRes = await trackByAwb("071-61180464", "ISR10056913", false);
  console.log("Status:", trackRes.data.status);
  console.log("Message:", trackRes.data.message);
  console.log("Events:", trackRes.data.events);
}
run().catch(console.error);
