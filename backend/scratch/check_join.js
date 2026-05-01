import pg from 'pg';

const connectionString = "postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function run() {
    const res = await pool.query(`
      SELECT
        qs.mawb,
        qs.hawb,
        qs.domain_name,
        ls.shipment_id as ls_shipment_id,
        ls.last_event_at
      FROM query_schedule qs
      LEFT JOIN leg_status_summary ls 
        ON ls.tenant_id = qs.tenant_id AND ls.shipment_id = COALESCE(qs.hawb, qs.mawb) AND ls.leg_sequence = 1
      WHERE qs.mawb LIKE '%19736625%'
    `);
    console.table(res.rows);
    process.exit(0);
}

run();
