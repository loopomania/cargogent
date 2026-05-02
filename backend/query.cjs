const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require' });
async function run() {
  await client.connect();
  const res1 = await client.query(`SELECT COUNT(*) FROM query_schedule qs JOIN users u ON u.tenant_id = qs.tenant_id WHERE u.username = 'alon@loopomaina.com'`);
  const res2 = await client.query(`SELECT COUNT(DISTINCT(mawb)) FROM query_events qe JOIN users u ON u.tenant_id = qe.tenant_id WHERE u.username = 'alon@loopomaina.com'`);
  const res3 = await client.query(`SELECT COUNT(DISTINCT(shipment_id)) FROM excel_transport_lines et JOIN users u ON u.tenant_id = et.tenant_id WHERE u.username = 'alon@loopomaina.com'`);
  const res4 = await client.query(`SELECT COUNT(*) FROM query_schedule qs JOIN users u ON u.tenant_id = qs.tenant_id JOIN leg_status_summary ls ON ls.tenant_id = qs.tenant_id AND ls.shipment_id = COALESCE(qs.hawb, qs.mawb) AND ls.leg_sequence = 1 WHERE u.username = 'alon@loopomaina.com'`);
  console.log('query_schedule count:', res1.rows[0].count);
  console.log('query_events unique mawb count:', res2.rows[0].count);
  console.log('excel_transport_lines unique shipment_id count:', res3.rows[0].count);
  console.log('query_schedule WITH leg_status_summary count:', res4.rows[0].count);
  await client.end();
}
run().catch(console.error);
