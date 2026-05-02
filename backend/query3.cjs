const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require' });
async function run() {
  await client.connect();
  const res1 = await client.query(`SELECT COUNT(*) FROM query_schedule qs JOIN tenants t ON qs.tenant_id = t.id WHERE t.name = 'loopomania.com'`);
  const res2 = await client.query(`SELECT COUNT(*) FROM leg_status_summary ls JOIN tenants t ON ls.tenant_id = t.id WHERE t.name = 'loopomania.com'`);
  const res3 = await client.query(`SELECT COUNT(DISTINCT(mawb)) FROM query_events qe JOIN tenants t ON qe.tenant_id = t.id WHERE t.name = 'loopomania.com'`);
  console.log('query_schedule count:', res1.rows[0].count);
  console.log('leg_status_summary count:', res2.rows[0].count);
  console.log('query_events unique mawb count:', res3.rows[0].count);
  await client.end();
}
run().catch(console.error);
