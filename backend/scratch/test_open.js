import pg from 'pg';

const connectionString = "postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function run() {
    const tenantId = '8998b6c6-85b4-4be5-af58-49c6bdc28890';
    const domainName = 'loopomania.com';
    
    console.log("Fetching open...");
    const res = await pool.query(
    `
    SELECT
      qs.mawb || '-' || COALESCE(qs.hawb, '') as awb_id,
      qs.mawb,
      qs.hawb,
      ls.aggregated_status as status,
      ls.summary->>'eta' as eta,
      ls.last_event_at::text as last_update
    FROM query_schedule qs
    LEFT JOIN leg_status_summary ls 
      ON ls.tenant_id = qs.tenant_id AND ls.shipment_id = COALESCE(qs.hawb, qs.mawb) AND ls.leg_sequence = 1
    WHERE qs.tenant_id = $1::uuid
      AND ($2::text IS NULL OR qs.domain_name = $2 OR qs.domain_name IS NULL)
      AND ls.last_event_at >= NOW() - INTERVAL '24 hours'
      AND qs.error_count_consecutive < 3
    ORDER BY ls.last_event_at DESC
    `,
    [tenantId, domainName || null]
  );
    
    const matches = res.rows.filter(a => a.mawb.includes('19736625'));
    console.log("Matches:", matches);

    process.exit(0);
}

run();
