/**
 * One-off: DELETE query_schedule rows whose leg_status_summary shows terminal delivered,
 * so they drop out of Need Attention immediately (same rules as awbReadService + saveTrackingResult).
 *
 * Usage from repo: cd backend && node scratch/remove_delivered_from_query_schedule.js
 * Requires DATABASE_URL (loads ../.env-prod relative to backend/).
 */
import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env-prod") });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing (.env-prod not loaded?)");
    process.exit(1);
  }

  const preview = await pool.query(`
    SELECT qs.tenant_id, qs.mawb, qs.hawb, ls.aggregated_status
    FROM query_schedule qs
    INNER JOIN leg_status_summary ls
      ON ls.tenant_id = qs.tenant_id
      AND ls.leg_sequence = 1
      AND LOWER(TRIM(ls.shipment_id)) = LOWER(TRIM(COALESCE(qs.hawb, qs.mawb)))
    WHERE (
      (
        TRIM(COALESCE(ls.aggregated_status, '')) ILIKE 'delivered%'
        AND TRIM(COALESCE(ls.aggregated_status, '')) NOT ILIKE 'partial%'
      )
      OR TRIM(COALESCE(ls.aggregated_status, '')) ILIKE 'status dlv%'
      OR TRIM(COALESCE(ls.aggregated_status, '')) ILIKE 'archived%'
      OR COALESCE((ls.summary::jsonb #>> '{milestone_projection,meta,is_dlv}'), '') = 'true'
      OR LOWER(TRIM(COALESCE(ls.summary::jsonb #>> '{milestone_projection,meta,overall_status}', ''))) IN ('delivered', 'delivered to origin')
    )
    ORDER BY qs.tenant_id, qs.mawb, qs.hawb
  `);
  console.log(`Matched ${preview.rows.length} query_schedule row(s) to remove.`);

  const del = await pool.query(`
    DELETE FROM query_schedule qs
    USING leg_status_summary ls
    WHERE qs.tenant_id = ls.tenant_id
      AND ls.leg_sequence = 1
      AND LOWER(TRIM(ls.shipment_id)) = LOWER(TRIM(COALESCE(qs.hawb, qs.mawb)))
      AND (
        (
          TRIM(COALESCE(ls.aggregated_status, '')) ILIKE 'delivered%'
          AND TRIM(COALESCE(ls.aggregated_status, '')) NOT ILIKE 'partial%'
        )
        OR TRIM(COALESCE(ls.aggregated_status, '')) ILIKE 'status dlv%'
        OR TRIM(COALESCE(ls.aggregated_status, '')) ILIKE 'archived%'
        OR COALESCE((ls.summary::jsonb #>> '{milestone_projection,meta,is_dlv}'), '') = 'true'
        OR LOWER(TRIM(COALESCE(ls.summary::jsonb #>> '{milestone_projection,meta,overall_status}', ''))) IN ('delivered', 'delivered to origin')
      )
  `);
  console.log("Deleted from query_schedule:", del.rowCount);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
