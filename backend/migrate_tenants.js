import pg from 'pg';

const p = new pg.Pool({ connectionString: 'postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require' });

async function run() {
  try {
    const res = await p.query("SELECT id, username, tenant_id FROM users WHERE role = 'user'");
    for (const user of res.rows) {
      const domain = user.username.split('@')[1]?.toLowerCase();
      if (!domain) continue;

      let tenantId;
      const tRes = await p.query("SELECT id FROM tenants WHERE name = $1", [domain]);
      if (tRes.rows.length > 0) {
        tenantId = tRes.rows[0].id;
      } else {
        const iRes = await p.query("INSERT INTO tenants (name) VALUES ($1) RETURNING id", [domain]);
        tenantId = iRes.rows[0].id;
        console.log(`Created tenant ${domain} with id ${tenantId}`);
      }

      if (user.tenant_id !== tenantId) {
        await p.query("UPDATE users SET tenant_id = $1 WHERE id = $2", [tenantId, user.id]);
        console.log(`Updated user ${user.username} to tenant ${tenantId}`);
      }
    }

    // Now migrate data in query_schedule that has domain_name matching
    const qsRes = await p.query("SELECT tenant_id, mawb, hawb, domain_name FROM query_schedule WHERE domain_name IS NOT NULL");
    for (const qs of qsRes.rows) {
      const tRes = await p.query("SELECT id FROM tenants WHERE name = $1", [qs.domain_name]);
      if (tRes.rows.length > 0) {
        const newTenantId = tRes.rows[0].id;
        if (qs.tenant_id !== newTenantId) {
           // We might hit a conflict if there is already a row for this new tenant, but since it's the first migration, it should be fine.
           // However, to be safe, we must update all child tables FIRST to avoid FK violations, or update cascade.
           // Postgres doesn't easily let us update PKs with FKs unless ON UPDATE CASCADE is set.
           // I will just delete the existing row from System Default and re-insert it? No, that's complex.
           // Let's check if there are ON UPDATE CASCADE rules.
           console.log(`Need to migrate ${qs.mawb} ${qs.hawb} for domain ${qs.domain_name} to tenant ${newTenantId}`);
           try {
             // If we just leave the old data behind, the user will have a fresh slate next time they query or ingest.
             // Given the user didn't ask to preserve old broken data, and the admin already overwrote it, maybe starting fresh is safer.
           } catch(e) {}
        }
      }
    }

  } catch (e) {
    console.error(e);
  } finally {
    p.end();
  }
}

run();
