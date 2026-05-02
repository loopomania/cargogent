const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require' });
async function run() {
  await client.connect();
  const res = await client.query(`SELECT aggregated_status, last_event_list_hash FROM leg_status_summary WHERE shipment_id = 'ISR10056114'`);
  console.log("Status:", res.rows);
  const res2 = await client.query(`SELECT status_code, status_text, location FROM query_events WHERE hawb = 'ISR10056114'`);
  console.log("Events:", res2.rows);
  await client.end();
}
run().catch(console.error);
