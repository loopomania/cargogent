import { trackAwbLocal } from '../src/routes/track';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

async function main() {
    const res = await trackAwbLocal('8998b6c6-85b4-4be5-af58-49c6bdc28890', '01692075804', 'ISR10055888', 'loopomania.com');
    console.log(res);
}
main().catch(console.error);
