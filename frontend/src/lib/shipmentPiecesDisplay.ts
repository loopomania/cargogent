import type { MilestoneProjection } from "./api";

export function parsePiecesCount(value: unknown): number {
  if (value == null || value === "") return 0;
  const n = parseInt(String(value).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Piece count for shipment headers: prefer DEP/ARR (air segment) values so we do not
 * inflate with MAWB-level or ground-handler scans on RCS/RCF/DLV nodes.
 */
export function canonicalShipmentPieceCount(
  proj: MilestoneProjection | undefined | null,
  importPiecesHint?: unknown,
): number {
  if (!proj?.flows_steps?.length) {
    const imp = parsePiecesCount(importPiecesHint);
    return imp > 0 ? imp : 0;
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

  const metaMax = proj.meta?.max_pieces ?? 0;
  if (metaMax > 0) return metaMax;

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
