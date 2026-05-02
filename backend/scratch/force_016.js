import { trackAwbLocal } from '../dist/routes/track.js';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

async function main() {
    const tenantId = '8998b6c6-85b4-4be5-af58-49c6bdc28890';
    console.log("Forcing track on 01692075841 / ISR10056087");
    const res = await trackAwbLocal(tenantId, '01692075841', 'ISR10056087', 'loopomania.com');
    console.log("Result status:", res.status);
    process.exit(0);
}
main().catch(console.error);
