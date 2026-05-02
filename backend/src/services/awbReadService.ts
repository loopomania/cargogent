import { getPool } from "./db.js";

export interface CustomerAwbRow {
  awb_id: string;
  mawb: string;
  hawb: string | null;
  status: string | null;
  eta: string | null;
  ata: string | null;
  last_update: string | null;
  reasons: string[];
}

export async function listAttentionAwbsForTenant(tenantId: string, domainName?: string): Promise<CustomerAwbRow[]> {
  const pool = getPool();
  if (!pool) return [];

  const res = await pool.query(
    `
    SELECT
      qs.mawb || '-' || COALESCE(qs.hawb, '') as awb_id,
      qs.mawb,
      qs.hawb,
      CASE WHEN qs.error_count_consecutive >= 3 THEN 'Query Blocked' ELSE ls.aggregated_status END as status,
      ls.summary->>'eta' as eta,
      ls.last_event_at::text as last_update,
      (ls.last_event_at < NOW() - INTERVAL '24 hours' OR ls.last_event_at IS NULL) as stale_24h,
      (qs.error_count_consecutive >= 3) as error_halt
    FROM query_schedule qs
    LEFT JOIN leg_status_summary ls 
      ON ls.tenant_id = qs.tenant_id
      AND ls.leg_sequence = 1
      AND LOWER(TRIM(ls.shipment_id)) = LOWER(TRIM(COALESCE(qs.hawb, qs.mawb)))
    WHERE qs.tenant_id = $1::uuid
      AND ($2::text IS NULL OR qs.domain_name = $2 OR qs.domain_name IS NULL)
      AND NOT (
        (
          TRIM(COALESCE(ls.aggregated_status, '')) ILIKE 'delivered%'
          AND TRIM(COALESCE(ls.aggregated_status, '')) NOT ILIKE 'partial%'
        )
        OR TRIM(COALESCE(ls.aggregated_status, '')) ILIKE 'status dlv%'
        OR TRIM(COALESCE(ls.aggregated_status, '')) ILIKE 'archived%'
        OR COALESCE((ls.summary::jsonb #>> '{milestone_projection,meta,is_dlv}'), '') = 'true'
        OR LOWER(TRIM(COALESCE(ls.summary::jsonb #>> '{milestone_projection,meta,overall_status}', ''))) IN ('delivered', 'delivered to origin')
      )
      AND (ls.last_event_at < NOW() - INTERVAL '24 hours' OR ls.last_event_at IS NULL OR qs.error_count_consecutive >= 3)
    ORDER BY ls.last_event_at ASC NULLS FIRST
    `,
    [tenantId, domainName || null],
  );

  return res.rows.map((r) => ({
    awb_id: r.awb_id,
    mawb: r.mawb,
    hawb: r.hawb,
    status: r.status,
    eta: r.eta,
    ata: null,
    last_update: r.last_update,
    reasons: [...(r.stale_24h ? ["No update 24h+"] : []), ...(r.error_halt ? ["Query Blocked (Errors)"] : [])],
  }));
}

export async function listOpenAwbsForTenant(tenantId: string, domainName?: string): Promise<CustomerAwbRow[]> {
  const pool = getPool();
  if (!pool) return [];

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
      ON ls.tenant_id = qs.tenant_id
      AND ls.leg_sequence = 1
      AND LOWER(TRIM(ls.shipment_id)) = LOWER(TRIM(COALESCE(qs.hawb, qs.mawb)))
    WHERE qs.tenant_id = $1::uuid
      AND ($2::text IS NULL OR qs.domain_name = $2 OR qs.domain_name IS NULL)
      AND NOT (
        (
          TRIM(COALESCE(ls.aggregated_status, '')) ILIKE 'delivered%'
          AND TRIM(COALESCE(ls.aggregated_status, '')) NOT ILIKE 'partial%'
        )
        OR TRIM(COALESCE(ls.aggregated_status, '')) ILIKE 'status dlv%'
        OR TRIM(COALESCE(ls.aggregated_status, '')) ILIKE 'archived%'
        OR COALESCE((ls.summary::jsonb #>> '{milestone_projection,meta,is_dlv}'), '') = 'true'
        OR LOWER(TRIM(COALESCE(ls.summary::jsonb #>> '{milestone_projection,meta,overall_status}', ''))) IN ('delivered', 'delivered to origin')
      )
      AND ls.last_event_at >= NOW() - INTERVAL '24 hours'
      AND qs.error_count_consecutive < 3
    ORDER BY ls.last_event_at DESC
    `,
    [tenantId, domainName || null]
  );

  return res.rows.map((r) => ({
    awb_id: r.awb_id,
    mawb: r.mawb,
    hawb: r.hawb,
    status: r.status,
    eta: r.eta,
    ata: null,
    last_update: r.last_update,
    reasons: [],
  }));
}

export async function listArchivedAwbsForTenant(tenantId: string, page = 1, limit = 100, search = "", domainName?: string): Promise<{ data: CustomerAwbRow[], total: number }> {
  const pool = getPool();
  if (!pool) return { data: [], total: 0 };

  const offset = (page - 1) * limit;
  let conditions = "WHERE qs.mawb IS NULL";
  const params: any[] = [tenantId, limit, offset];
  
  if (domainName) {
    params.push(domainName);
    conditions += ` AND (qs.domain_name = $${params.length} OR qs.domain_name IS NULL)`;
  }

  if (search) {
    params.push(`%${search}%`);
    conditions += ` AND (q.mawb ILIKE $${params.length} OR COALESCE(q.hawb, '') ILIKE $${params.length})`;
  }

  const res = await pool.query(
    `
    WITH Archived AS (
      SELECT q.tenant_id, q.mawb, q.hawb
      FROM query_events q
      WHERE q.tenant_id = $1::uuid
      GROUP BY q.tenant_id, q.mawb, q.hawb
    ),
    Filtered AS (
      SELECT 
        q.mawb || '-' || COALESCE(q.hawb, '') as awb_id,
        q.mawb,
        q.hawb,
        ls.aggregated_status as status,
        ls.summary->>'eta' as eta,
        ls.summary->>'ata' as ata,
        ls.last_event_at::text as last_update
      FROM Archived q
      LEFT JOIN leg_status_summary ls 
        ON ls.tenant_id = q.tenant_id AND ls.shipment_id = COALESCE(q.hawb, q.mawb) AND ls.leg_sequence = 1
      LEFT JOIN query_schedule qs 
        ON qs.tenant_id = q.tenant_id AND qs.mawb = q.mawb AND COALESCE(qs.hawb, '') = COALESCE(q.hawb, '')
      ${conditions}
    )
    SELECT *, COUNT(*) OVER() as total_count
    FROM Filtered
    ORDER BY last_update DESC NULLS LAST
    LIMIT $2 OFFSET $3
    `,
    params
  );

  const total = res.rows.length > 0 ? parseInt(res.rows[0].total_count, 10) : 0;

  const data = res.rows.map((r) => ({
    awb_id: r.awb_id,
    mawb: r.mawb,
    hawb: r.hawb,
    status: r.status,
    eta: r.eta,
    ata: r.ata,
    last_update: r.last_update,
    reasons: [],
  }));

  return { data, total };
}
