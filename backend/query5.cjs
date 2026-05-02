const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require' });
async function run() {
  await client.connect();
  const res3 = await client.query(`
    SELECT et.master_awb, et.house_ref 
    FROM excel_transport_lines et 
    JOIN tenants t ON et.tenant_id = t.id 
    WHERE t.name = 'loopomania.com'
    GROUP BY et.master_awb, et.house_ref
    EXCEPT
    (
      SELECT qs.mawb, qs.hawb 
      FROM query_schedule qs 
      JOIN tenants t ON qs.tenant_id = t.id 
      WHERE t.name = 'loopomania.com'
      UNION
      SELECT qe.mawb, qe.hawb
      FROM query_events qe
      JOIN tenants t ON qe.tenant_id = t.id
      WHERE t.name = 'loopomania.com'
    )
  `);
  console.log(res3.rows);
  await client.end();
}
run().catch(console.error);
