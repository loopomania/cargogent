const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require' });
async function run() {
  await client.connect();
  const res1 = await client.query(`SELECT username, role FROM users`);
  console.log(res1.rows);
  const res2 = await client.query(`SELECT t.name, COUNT(*) as c FROM excel_transport_lines et JOIN tenants t ON et.tenant_id = t.id GROUP BY t.name`);
  console.log(res2.rows);
  await client.end();
}
run().catch(console.error);
