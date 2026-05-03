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

const activeShipmentExclusionSql = `
      NOT (
        (
          TRIM(COALESCE(ls.aggregated_status, '')) ILIKE 'delivered%'
          AND TRIM(COALESCE(ls.aggregated_status, '')) NOT ILIKE 'partial%'
        )
        OR TRIM(COALESCE(ls.aggregated_status, '')) ILIKE 'status dlv%'
        OR TRIM(COALESCE(ls.aggregated_status, '')) ILIKE 'archived%'
        OR COALESCE((ls.summary::jsonb #>> '{milestone_projection,meta,is_dlv}'), '') = 'true'
        OR LOWER(TRIM(COALESCE(ls.summary::jsonb #>> '{milestone_projection,meta,overall_status}', ''))) IN ('delivered', 'delivered to origin')
      )
`;

/** Latest DEP time + whether any carrier event exists strictly after that time (same tenant/mawb/hawb). */
const depSilenceFlagsJoinSql = `
    LEFT JOIN LATERAL (
      SELECT
        d.last_dep_at,
        CASE
          WHEN d.last_dep_at IS NULL THEN FALSE
          ELSE NOT EXISTS (
            SELECT 1
            FROM query_events qx
            WHERE qx.tenant_id = qs.tenant_id
              AND qx.mawb = qs.mawb
              AND qx.hawb = qs.hawb
              AND qx.occurred_at IS NOT NULL
              AND qx.occurred_at > d.last_dep_at
          )
        END AS nothing_after_dep
      FROM (
        SELECT MAX(qe.occurred_at)::timestamptz AS last_dep_at
        FROM query_events qe
        WHERE qe.tenant_id = qs.tenant_id
          AND qe.mawb = qs.mawb
          AND qe.hawb = qs.hawb
          AND qe.status_code = 'DEP'
          AND qe.occurred_at IS NOT NULL
      ) d
    ) deps ON TRUE
`;

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
      (
        (ls.last_event_at IS NOT NULL AND ls.last_event_at < NOW() - INTERVAL '24 hours')
        OR (ls.last_event_at IS NULL AND qs.created_at < NOW() - INTERVAL '24 hours')
      ) as stale_24h,
      (qs.error_count_consecutive >= 3) as error_halt,
      (
        deps.last_dep_at IS NOT NULL
        AND deps.nothing_after_dep
        AND deps.last_dep_at < NOW() - INTERVAL '12 hours'
      ) AS stale_dep_12h
    FROM query_schedule qs
    LEFT JOIN leg_status_summary ls
      ON ls.tenant_id = qs.tenant_id
      AND ls.leg_sequence = 1
      AND LOWER(TRIM(ls.shipment_id)) = LOWER(TRIM(COALESCE(qs.hawb, qs.mawb)))
    ${depSilenceFlagsJoinSql}
    WHERE qs.tenant_id = $1::uuid
      AND ($2::text IS NULL OR qs.domain_name = $2 OR qs.domain_name IS NULL)
      AND ${activeShipmentExclusionSql}
      AND (
        (ls.last_event_at IS NOT NULL AND ls.last_event_at < NOW() - INTERVAL '24 hours')
        OR (ls.last_event_at IS NULL AND qs.created_at < NOW() - INTERVAL '24 hours')
        OR qs.error_count_consecutive >= 3
        OR (
          deps.last_dep_at IS NOT NULL
          AND deps.nothing_after_dep
          AND deps.last_dep_at < NOW() - INTERVAL '12 hours'
        )
      )
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
    reasons: [
      ...(r.stale_24h ? ["No update 24h+"] : []),
      ...(r.stale_dep_12h ? ["No carrier update 12h+ after takeoff (DEP)"] : []),
      ...(r.error_halt ? ["Query Blocked (Errors)"] : []),
    ],
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
      CASE
        WHEN ls.last_event_at IS NULL THEN 'Waiting for query'
        ELSE ls.aggregated_status
      END as status,
      ls.summary->>'eta' as eta,
      ls.last_event_at::text as last_update
    FROM query_schedule qs
    LEFT JOIN leg_status_summary ls
      ON ls.tenant_id = qs.tenant_id
      AND ls.leg_sequence = 1
      AND LOWER(TRIM(ls.shipment_id)) = LOWER(TRIM(COALESCE(qs.hawb, qs.mawb)))
    ${depSilenceFlagsJoinSql}
    WHERE qs.tenant_id = $1::uuid
      AND ($2::text IS NULL OR qs.domain_name = $2 OR qs.domain_name IS NULL)
      AND ${activeShipmentExclusionSql}
      AND (
        (ls.last_event_at IS NOT NULL AND ls.last_event_at >= NOW() - INTERVAL '24 hours')
        OR (ls.last_event_at IS NULL AND qs.created_at >= NOW() - INTERVAL '24 hours')
      )
      AND qs.error_count_consecutive < 3
      AND NOT (
        deps.last_dep_at IS NOT NULL
        AND deps.nothing_after_dep
        AND deps.last_dep_at < NOW() - INTERVAL '12 hours'
      )
    ORDER BY COALESCE(ls.last_event_at, qs.created_at) DESC NULLS LAST
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
