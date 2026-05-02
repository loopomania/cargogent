const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require' });
async function run() {
  await client.connect();
  const res = await client.query(`SELECT awb, hawb, airline_code, error_message, status FROM query_logs WHERE awb LIKE '%69559552286%' ORDER BY created_at DESC LIMIT 5`);
  console.log("Logs:", res.rows);
  const res2 = await client.query(`SELECT status, last_update, payload FROM leg_status_summary WHERE shipment_id = '69559552286' OR shipment_id = 'ISR10056114' LIMIT 1`);
  console.log("Summary:", res2.rows);
  await client.end();
}
run().catch(console.error);
