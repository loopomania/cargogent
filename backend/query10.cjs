const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require' });
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT COUNT(*) FROM excel_transport_lines et JOIN tenants t ON et.tenant_id = t.id WHERE t.name = 'loopomania.com' AND (master_awb IS NULL OR length(master_awb) <= 5)
  `);
  console.log("Invalid MAWB lines:", res.rows[0].count);
  await client.end();
}
run().catch(console.error);
