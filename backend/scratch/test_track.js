import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

async function main() {
  const url = `http://localhost:${process.env.PORT || 3000}/api/health`;
  console.log("Fetching health...", url);
  const h = await fetch(url).then(r => r.json());
  console.log(h);
}
main().catch(console.error);
