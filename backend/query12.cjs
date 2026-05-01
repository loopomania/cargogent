const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require' });
async function run() {
  await client.connect();
  const res = await client.query(`UPDATE query_schedule SET is_halted = false, error_count_consecutive = 0, next_status_check_at = NOW() WHERE mawb = '69559552286'`);
  console.log("Reset shipments:", res.rowCount);
  await client.end();
}
run().catch(console.error);
