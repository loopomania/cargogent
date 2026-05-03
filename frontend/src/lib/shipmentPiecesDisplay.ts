import type { MilestoneProjection } from "./api";

export function parsePiecesCount(value: unknown): number {
  if (value == null || value === "") return 0;
  const n = parseInt(String(value).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Prefer `excel_pieces_hint` (CargoGent ingest) over `pieces` (often MAWB rollup from tracker). */
export function excelPiecesHintFromRawMeta(raw: Record<string, unknown> | undefined | null): unknown {
  if (!raw || typeof raw !== "object") return undefined;
  const ex = raw["excel_pieces_hint"];
  if (ex != null && ex !== "") return ex;
  return raw["pieces"];
}

/**
 * Piece count for shipment headers: trust `meta.max_pieces` from the milestone engine first
 * (house caps, DLV rollups). Then fall back to DEP/ARR-only scan so we do not show MAWB-inflated
 * node labels when the engine already clamped the summary.
 */
export function canonicalShipmentPieceCount(
  proj: MilestoneProjection | undefined | null,
  importPiecesHint?: unknown,
): number {
  if (!proj?.flows_steps?.length) {
    const imp = parsePiecesCount(importPiecesHint);
    return imp > 0 ? imp : 0;
  }

  const metaMax = proj.meta?.max_pieces ?? 0;
  if (typeof metaMax === "number" && metaMax > 0 && Number.isFinite(metaMax)) {
    return metaMax;
  }

  let flightMax = 0;
  for (const steps of proj.flows_steps) {
    for (const step of steps) {
      if (step.kind !== "node") continue;
      if (step.code !== "DEP" && step.code !== "ARR") continue;
      flightMax = Math.max(flightMax, parsePiecesCount(step.pieces));
    }
  }
  if (flightMax > 0) return flightMax;

  let anyMax = 0;
  for (const steps of proj.flows_steps) {
    for (const step of steps) {
      if (step.kind === "node" && step.pieces != null && step.pieces !== "") {
        anyMax = Math.max(anyMax, parsePiecesCount(step.pieces));
      }
    }
  }
  if (anyMax > 0) return anyMax;

  const imp = parsePiecesCount(importPiecesHint);
  if (imp > 0) return imp;

  return 0;
}
