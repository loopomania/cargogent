const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require' });
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT COUNT(*) FROM (
      SELECT q.mawb, q.hawb
      FROM query_events q
      JOIN tenants t ON q.tenant_id = t.id
      LEFT JOIN query_schedule qs ON qs.tenant_id = q.tenant_id AND qs.mawb = q.mawb AND COALESCE(qs.hawb, '') = COALESCE(q.hawb, '')
      WHERE t.name = 'loopomania.com' AND qs.mawb IS NULL
      GROUP BY q.mawb, q.hawb
    ) as sub
  `);
  console.log("Archived shipments count:", res.rows[0].count);
  await client.end();
}
run().catch(console.error);
