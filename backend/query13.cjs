const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require' });
async function run() {
  await client.connect();
  const res = await client.query(`SELECT stale_alert_sent FROM query_schedule WHERE mawb = '69559552286'`);
  console.log("Status:", res.rows);
  await client.end();
}
run().catch(console.error);
