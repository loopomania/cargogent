const { Client } = require('pg');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('.env-prod'));

const client = new Client({
  connectionString: envConfig.DATABASE_URL
});

async function run() {
  await client.connect();
  const res = await client.query("SELECT payload FROM query_events WHERE mawb = '01437625582' AND hawb = 'ISR10055923' ORDER BY occurred_at ASC");
  console.log(JSON.stringify(res.rows.map(r => JSON.parse(r.payload)), null, 2));
  await client.end();
}
run();
