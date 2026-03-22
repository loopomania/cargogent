import { getPool } from "./db.js";

export interface AttentionAwbRow {
  awb_id: string;
  mawb: string;
  hawb: string | null;
  latest_status: string | null;
  updated_at: string;
  reasons: ("stale_24h" | "special_treatment")[];
}

/**
 * PRD default AWBs view: active (in-transit) rows that are stale 24h and/or on-ground + special treatment.
 */
export async function listAttentionAwbsForTenant(tenantId: string): Promise<AttentionAwbRow[]> {
  const pool = getPool();
  if (!pool) return [];

  const res = await pool.query<
    AttentionAwbRow & { stale: boolean; special: boolean }
  >(
    `
    SELECT
      als.awb_id::text,
      als.awb_number AS mawb,
      hml.hawb AS hawb,
      als.latest_status,
      als.updated_at::text,
      (als.updated_at < NOW() - INTERVAL '24 hours') AS stale,
      FALSE AS special
    FROM awb_latest_status als
    LEFT JOIN hawb_mawb_lines hml ON hml.tenant_id = als.tenant_id AND hml.mawb = als.awb_number
    INNER JOIN awbs_in_transit ait
      ON als.tenant_id = ait.tenant_id AND als.awb_id = ait.awb_id
    WHERE als.tenant_id = $1::uuid
      AND (
        als.updated_at < NOW() - INTERVAL '24 hours'
      )
    ORDER BY als.updated_at ASC
    `,
    [tenantId]
  );

  return res.rows.map((row) => {
    const reasons: ("stale_24h" | "special_treatment")[] = [];
    if (row.stale) reasons.push("stale_24h");
    if (row.special) reasons.push("special_treatment");
    const { stale: _s, special: _p, ...rest } = row;
    return { ...rest, reasons };
  });
}
