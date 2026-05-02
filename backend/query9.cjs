const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require' });
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT COUNT(DISTINCT (master_awb, house_ref)) FROM excel_transport_lines et JOIN tenants t ON et.tenant_id = t.id WHERE t.name = 'loopomania.com' AND master_awb != ''
  `);
  console.log("Unique valid shipments:", res.rows[0].count);
  await client.end();
}
run().catch(console.error);
