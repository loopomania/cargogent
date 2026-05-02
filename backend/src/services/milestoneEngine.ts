import { normalizeEventDate } from "./eventDateNormalize.js";
import {
  MILESTONE_PROJECTION_VERSION,
  SCHEDULE_POLICY_VERSION,
} from "./milestoneVersions.js";

/** Serializable event subset for milestones + timelines */
export interface MilestoneEvent {
  status_code?: string;
  status?: string;
  location?: string;
  date?: string;
  pieces?: string;
  actual_pieces?: string;
  weight?: string;
  remarks?: string;
  flight?: string;
  departure_date?: string;
  arrival_date?: string;
  reception_date?: string;
  estimated_date?: string;
  source?: string;
}

export interface ExcelLegInput {
  seq?: number;
  from?: string;
  to?: string;
  etd?: string | null;
  eta?: string | null;
  flight?: string | null;
}

export interface MilestoneProjectionArrow {
  kind: "arrow";
  done: boolean;
}

export interface MilestoneProjectionNode {
  kind: "node";
  code: string;
  label: string;
  desc: string;
  done: boolean;
  active: boolean;
  location?: string;
  status_code?: string;
  flight?: string;
  pieces?: string | null;
  weight?: string | null;
  date?: string;
  estimated_date?: string | null;
  departure_date?: string | null;
  arrival_date?: string | null;
  excelEtd?: string | null;
  excelEta?: string | null;
}

export type MilestoneProjectionStep = MilestoneProjectionArrow | MilestoneProjectionNode;

export interface MilestoneFailedRouteSummary {
  routeText: string;
  flightNo: string;
  plannedHint: string;
}

export interface MilestoneProjection {
  milestone_projection_version: string;
  schedule_policy_version: string;
  interpretation_trace: string[];
  origin_display: string;
  dest_display: string;
  flows_steps: MilestoneProjectionStep[][];
  failed_route_summaries: MilestoneFailedRouteSummary[];
  meta: {
    paths_count: number;
    has_maman: boolean;
    has_swissport: boolean;
    is_dlv: boolean;
    is_err: boolean;
    overall_status: string;
    max_pieces: number;
    ground_handlers_label: string;
  };
}

interface SegmentInfo {
  from: string;
  to: string;
  service: string;
  departureStr?: string | null;
}

interface Leg {
  from: string;
  to: string;
  service: string;
  flightNo: string | null;
  atd: string | null;
  etd: string | null;
  ata: string | null;
  eta: string | null;
  pieces: string | null;
  weight: string | null;
  events: MilestoneEvent[];
}

const cycleOrder: Record<string, number> = {
  BKD: 1, RCS: 2, FOH: 2, DIS: 2, SFM: 2, MAN: 3, DEP: 4, ARR: 5, RCF: 6, NFD: 7, AWD: 8, DLV: 9,
};

/** First integer in carrier piece strings ("1 pcs", "1 / 46") */
function extractPiecesCount(val?: string | null): number {
  if (val == null || val === "") return 0;
  const m = String(val).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function maxPiecesAcrossEvents(events: MilestoneEvent[]): number {
  let m = 0;
  for (const e of events) {
    m = Math.max(m, extractPiecesCount(e.pieces ?? e.actual_pieces));
  }
  return m;
}

/**
 * Thai/consolidations often post multiple DLV/AWD rows at destination (1 pc each) while movement rows show 7.
 * Sum only when there are 2+ positive piece lines; cap to maxDeclared when duplicate full scans would double-count.
 */
function summedDestinationTerminalPieces(
  events: MilestoneEvent[],
  destDisp: string,
  maxDeclared: number,
): number {
  const d = cleanCity(destDisp);
  if (!d) return 0;
  const rows = events.filter(
    e =>
      ["DLV", "AWD"].includes(e.status_code ?? "") &&
      extractPiecesCount(e.pieces ?? e.actual_pieces) > 0 &&
      cleanCity(e.location ?? "") === d,
  );
  const nums = rows.map(e => extractPiecesCount(e.pieces ?? e.actual_pieces)).filter(n => n > 0);
  if (nums.length <= 1) return 0;
  const sum = nums.reduce((a, b) => a + b, 0);
  if (maxDeclared > 0 && sum > maxDeclared) return maxDeclared;
  return sum;
}

/** Max declared pcs on this leg's endpoints for the same flight (handles split RCF vs full ARR). */
function maxAirlinePiecesForLeg(leg: Leg, pool: MilestoneEvent[]): number {
  const want = normalizeFlight(leg.flightNo);
  let m = 0;
  for (const e of pool) {
    if (want && normalizeFlight(e.flight) !== want) continue;
    const loc = cleanCity(e.location);
    if (loc !== leg.from && loc !== leg.to) continue;
    m = Math.max(m, extractPiecesCount(e.pieces ?? e.actual_pieces));
  }
  return m;
}

const STATUS_TIER: Record<string, number> = {
  DLV: 100,
  AWD: 92,
  NFD: 88,
  RCF: 78,
  ARR: 72,
  DEP: 65,
  MAN: 48,
  RCS: 42,
  FOH: 42,
  DIS: 42,
  SFM: 22,
  BKD: 12,
};

function isGroundHandlerTimelineNoise(e: MilestoneEvent): boolean {
  return (
    e.source === "maman" ||
    e.source === "swissport" ||
    /\bmaman\b/i.test(e.location ?? "") ||
    /\bswissport\b/i.test(e.location ?? "")
  );
}

const MANIFEST_INTENT_BEFORE_DEP_MS = 4 * 60 * 60 * 1000;

/** When ACS splits MAN + DEP into neighboring rows — surface both in the condensed header status. */
function enrichOverallStatusDepWithManifest(best: MilestoneEvent, airlinePool: MilestoneEvent[]): string | null {
  if (best.status_code !== "DEP") return best.status ?? best.status_code ?? null;
  const base = `${best.status ?? ""}`.trim();
  const bt = safeTime(best);
  const depHub = cleanCity(best.location ?? "");
  if (!depHub || !bt) return base || best.status_code || null;

  const expectedFlt = normalizeFlight(best.flight);

  let manifest: MilestoneEvent | null = null;
  for (const e of airlinePool) {
    if (!(e.status_code === "MAN" || e.status_code === "FFM")) continue;
    const t = safeTime(e);
    if (!t || t > bt || bt - t > MANIFEST_INTENT_BEFORE_DEP_MS) continue;
    const evFl = normalizeFlight(e.flight);
    if (expectedFlt && evFl !== expectedFlt) continue;
    if (cleanCity(e.location ?? "") !== depHub) continue;
    manifest = !manifest || t > safeTime(manifest) ? e : manifest;
  }

  const manifestLine = `${manifest?.status ?? manifest?.remarks ?? ""}`.trim();
  if (!manifestLine) return base || best.status_code || null;


  const baseUpper = base.toUpperCase();


  const manUpper = manifestLine.toUpperCase();
  const baseDuplicatesManifest =
    baseUpper.length >= 10 && manUpper.includes(baseUpper.slice(0, 10));


  const baseCarriesInbound = /\bmovement\b|\bmanifested\b/i.test(base);
  const genericDepartBlurb =
    /\bdepart\b/i.test(base) && (!baseCarriesInbound || /^DEP\b/i.test(base.trim()));


  if (baseDuplicatesManifest || baseCarriesInbound) return base || manifestLine;
  const merged =
    genericDepartBlurb && base.length ? `${manifestLine} · ${base}` : `${manifestLine}${base.length ? ` · ${base}` : ""}`;
  return merged;
}

/** Latest meaningful airline scan for header text — avoids stale schedule status when events advanced. */
function deriveOverallStatus(
  events: MilestoneEvent[],
  payloadStatus: string | null | undefined,
  isDlv: boolean,
): string {
  if (isDlv) {
    if (isReturnToOriginDelivery(events)) return "Delivered to origin";
    return "Delivered";
  }
  const airlinePool = events.filter(e => !isGroundHandlerTimelineNoise(e) && safeTime(e) > 0);
  let best: MilestoneEvent | null = null;
  for (const e of airlinePool) {
    const code = e.status_code ?? "";
    const tier = STATUS_TIER[code] ?? 0;
    const t = safeTime(e);
    if (!best) {
      best = e;
      continue;
    }
    const bCode = best.status_code ?? "";
    const bTier = STATUS_TIER[bCode] ?? 0;
    const bt = safeTime(best);
    const muchLater = t > bt + 6 * 60 * 60 * 1000;
    const movementCodes = ["DEP", "ARR", "RCF", "NFD", "AWD", "DLV", "MAN"];
    // New manifest on a later leg is lower STATUS_TIER than an older RCF/ARR/DEP; still carrier truth.
    const laterManifestBeatsPriorLegMovement =
      t > bt && code === "MAN" && ["RCF", "ARR", "DEP"].includes(bCode);
    const sameHub = cleanCity(e.location) && cleanCity(e.location) === cleanCity(best.location);
    // DHL ACS: "Scheduled for Movement" (SFM) often posts after ARR at the same hub — still the freshest status.
    const laterSfmBeatsPriorHubArrival =
      t > bt && code === "SFM" && sameHub && ["ARR", "RCF"].includes(bCode);
    if (
      tier > bTier ||
      (tier === bTier && t > bt) ||
      (muchLater && movementCodes.includes(code) && movementCodes.includes(bCode) && tier >= bTier - 20) ||
      laterManifestBeatsPriorLegMovement ||
      laterSfmBeatsPriorHubArrival
    ) best = e;
  }
  if (best) {
    const enriched = enrichOverallStatusDepWithManifest(best, airlinePool)?.trim() ?? "";
    return enriched.length > 0 ? enriched : best.status ?? best.status_code ?? "In progress";
  }
  const depEarly = events.find(e => e.status_code === "DEP")?.status;
  if (depEarly) return depEarly;
  return payloadStatus ?? "In progress";
}

export function parseExcelPiecesHint(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && raw > 0 && Number.isFinite(raw)) return Math.floor(raw);
  const n = extractPiecesCount(String(raw));
  return n > 0 ? n : null;
}

/** When tracker + excel build a DAG, identical edges collapse to one leg (keep more flight-specific events). */
function dedupeLegGraphEdges(legs: Leg[]): Leg[] {
  const byKey = new Map<string, Leg>();
  for (const leg of legs) {
    // Collapse same physical route even if the carrier first publishes a booking flight and
    // later a different actual uplift flight for the same segment (common on Ethiopian).
    const key = `${leg.from}|${leg.to}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, leg);
      continue;
    }
    const legScore = (l: Leg) => {
      const evs = l.events ?? [];
      const hasActualMovement = evs.some(e => ["DEP", "ARR", "RCF"].includes(e.status_code || "") && safeTime(e) > 0);
      const hasDeparture = evs.some(e => e.status_code === "DEP" && safeTime(e) > 0);
      const newest = Math.max(0, ...evs.map(e => safeTime(e)));
      return (hasDeparture ? 10_000 : 0) + (hasActualMovement ? 1_000 : 0) + newest / 1e12;
    };
    byKey.set(key, legScore(leg) > legScore(prev) ? leg : prev);
  }
  return Array.from(byKey.values());
}

function chronoFlightOrderScore(flow: Leg[], airlineEvents: MilestoneEvent[]): number {
  const want = [...airlineEvents]
    .filter(e => !!normalizeFlight(e.flight))
    .sort((a, b) => safeTime(a) - safeTime(b))
    .map(e => normalizeFlight(e.flight) as string);
  const have = flow.map(l => normalizeFlight(l.flightNo)).filter(Boolean) as string[];
  let hj = 0;
  let score = 0;
  for (const w of want) {
    while (hj < have.length && have[hj] !== w) hj++;
    if (hj < have.length && have[hj] === w) {
      score += 6;
      hj++;
    }
  }
  return score;
}

function rankFlow(flow: Leg[], destination: string, airlineEvents: MilestoneEvent[]): number {
  const dc = cleanCity(destination);
  const lastTo = cleanCity(flow[flow.length - 1]?.to ?? "");
  let points = flow.length * 10;
  if (dc && lastTo === dc) points += 1000;
  const flights = flow.map(l => normalizeFlight(l.flightNo)).filter(Boolean);
  points += new Set(flights).size * 8;
  points += chronoFlightOrderScore(flow, airlineEvents);
  points += flow.reduce((sum, leg) => {
    const hasDeparture = leg.events.some(e => e.status_code === "DEP" && safeTime(e) > 0);
    const hasActual = leg.events.some(e => ["DEP", "ARR", "RCF"].includes(e.status_code || "") && safeTime(e) > 0);
    const newest = Math.max(0, ...leg.events.map(e => safeTime(e)));
    return sum + (hasDeparture ? 500 : 0) + (hasActual ? 100 : 0) + newest / 1e12;
  }, 0);

  let firstEvt = Infinity;
  for (const ln of flow) {
    for (const e of ln.events) {
      const t = safeTime(e);
      if (t > 0 && t < firstEvt) firstEvt = t;
    }
  }
  if (firstEvt !== Infinity) points += 1 / (1 + firstEvt / 1e12);

  return points;
}

/** Single physical shipment piece cannot follow divergent itineraries — retain best graph path. */
function collapseToSinglePieceFlow(
  flows: Leg[][],
  destination: string,
  airlineEvents: MilestoneEvent[],
): Leg[][] {
  if (flows.length <= 1) return flows;
  let best = flows[0];
  let bestRank = rankFlow(best, destination, airlineEvents);
  const tieKey = (f: Leg[]) =>
    f
      .map(l => `${l.from}->${l.to}:${normalizeFlight(l.flightNo) || ""}`)
      .join("|");
  for (let i = 1; i < flows.length; i++) {
    const r = rankFlow(flows[i], destination, airlineEvents);
    if (r > bestRank || (r === bestRank && tieKey(flows[i]) < tieKey(best))) {
      best = flows[i];
      bestRank = r;
    }
  }
  return [best];
}

function safeTime(e?: MilestoneEvent | null): number {
  const d = e?.date || e?.departure_date || e?.estimated_date;
  if (!d) return 0;
  const t = new Date(d).getTime();
  return isNaN(t) ? 0 : t;
}

function cleanCity(loc?: string | null): string | null {
  if (!loc || loc === "???") return null;
  const match = loc.match(/\(([A-Za-z]{3})\)/);
  if (match) return match[1].toUpperCase();

  let cl = loc.replace(/\s*\([^)]*\)/g, "").trim().toUpperCase();
  if (cl.length === 5 && !cl.includes(" ")) {
    cl = cl.substring(2);
  }
  return cl;
}

/** Cargo accepted at station A, physically moved elsewhere, then final DLV at A (e.g. return-to-origin). */
export function isReturnToOriginDelivery(
  events: Array<{ status_code?: string | null; location?: string | null; date?: string | null }>,
): boolean {
  if (!events.length) return false;
  const sorted = [...events].sort(
    (a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime(),
  );
  const firstRcs = sorted.find(e => e.status_code === "RCS" && e.location);
  const lastDlv = [...sorted].reverse().find(e => e.status_code === "DLV" && e.location);
  if (!firstRcs || !lastDlv) return false;
  const originStation = cleanCity(firstRcs.location);
  const finalDlv = cleanCity(lastDlv.location);
  if (!originStation || !finalDlv || originStation !== finalDlv) return false;
  const departedOrigin = sorted.some(
    e => e.status_code === "DEP" && cleanCity(e.location) === originStation,
  );
  // Include airline-specific arrival markers (e.g. Silk Way "AA") so hub touch counts without plain ARR.
  const touchedElsewhere = sorted.some(e => {
    const loc = cleanCity(e.location);
    if (!loc || loc === originStation) return false;
    const code = e.status_code || "";
    return ["DEP", "ARR", "RCF", "MAN", "AA"].includes(code);
  });
  return departedOrigin && touchedElsewhere;
}

function normalizeFlight(f?: string | null): string | null {
  if (!f) return null;
  const m = f.replace(/\s+/g, "").toUpperCase().match(/^([A-Z]{2,3})0*(\d{1,4})$/);
  return m ? `${m[1]}${m[2]}` : f.replace(/\s+/g, "").toUpperCase();
}

const ARROW_IN_TEXT = /(?:\u2192|->)/;

function parseSegmentRemark(remarks?: string | null): SegmentInfo | null {
  if (!remarks) return null;
  const parenArrow = remarks.match(
    new RegExp(`\\(([A-Z]{3})\\s*${ARROW_IN_TEXT.source}\\s*([A-Z]{3})\\)`, "i"),
  );
  if (parenArrow) {
    return {
      from: parenArrow[1].toUpperCase(),
      to: parenArrow[2].toUpperCase(),
      service: "FLIGHT",
      departureStr: null,
    };
  }
  const plainArrow = remarks.match(
    new RegExp(`\\b([A-Z]{3})\\s*${ARROW_IN_TEXT.source}\\s*([A-Z]{3})\\b`, "i"),
  );
  if (plainArrow) {
    return {
      from: plainArrow[1].toUpperCase(),
      to: plainArrow[2].toUpperCase(),
      service: "FLIGHT",
      departureStr: null,
    };
  }
  const seg = remarks.match(/Segment:\s*([A-Z]{2,4})\s+to\s+([A-Z]{2,4})/i);
  const svc = remarks.match(/Service:\s*([A-Z]+)/i);
  const dep = remarks.match(/Departure:\s*(.+?)(?:$|\n)/i);
  const scheduledLeg = remarks.match(/Scheduled Leg:\s*([A-Z]{3})\s*-\s*([A-Z]{3})/i);
  if (scheduledLeg) {
    return {
      from: scheduledLeg[1].toUpperCase(),
      to: scheduledLeg[2].toUpperCase(),
      service: "FLIGHT",
      departureStr: null,
    };
  }
  const fromTo = remarks.match(/\bfrom\s+([A-Z]{3})\s+to\s+([A-Z]{3})\b/i);
  if (fromTo) {
    return {
      from: fromTo[1].toUpperCase(),
      to: fromTo[2].toUpperCase(),
      service: "FLIGHT",
      departureStr: null,
    };
  }
  if (!seg) return null;
  return {
    from: seg[1].toUpperCase(),
    to: seg[2].toUpperCase(),
    service: (svc?.[1] ?? "FLIGHT").toUpperCase(),
    departureStr: dep?.[1]?.trim() ?? null,
  };
}

/** DHL ACS: "Manifested onto movement K4248 to LEJ" — scan site is origin (TLV), dest is in text. */
function segmentFromManifestMovementTo(ev: MilestoneEvent): SegmentInfo | null {
  const hay = `${ev.remarks ?? ""} ${ev.status ?? ""}`;
  const m = hay.match(/\bmovement\s+[\w]+\s+to\s+([A-Z]{3})\b/i);
  if (!m) return null;
  const fromLoc = cleanCity(ev.location ?? "");
  if (!fromLoc) return null;
  return {
    from: fromLoc,
    to: m[1].toUpperCase(),
    service: "FLIGHT",
    departureStr: null,
  };
}

function parseSegmentFromEvent(ev: MilestoneEvent): SegmentInfo | null {
  return (
    parseSegmentRemark(ev.remarks) ?? parseSegmentRemark(ev.status) ?? segmentFromManifestMovementTo(ev)
  );
}

/**
 * Tie MAN/DEP/ARR into one leg when ACS gives movement + flight only on MAN/FFM
 * ("… movement Q79824T to BHX") and DEP rows are plain "Depart Facility" with no parsed segment.
 */
function eventBelongsToManifestLeg(seg: SegmentInfo, normFlight: string | null, e: MilestoneEvent): boolean {
  const lf = normalizeFlight(e.flight);
  const parsed = parseSegmentFromEvent(e);
  if (parsed?.from === seg.from && parsed?.to === seg.to) {
    return !normFlight || !lf || lf === normFlight;
  }
  if (!normFlight || !lf || lf !== normFlight) return false;

  const ec = cleanCity(e.location ?? "");
  return (
    (e.status_code === "DEP" && ec === seg.from) ||
    (["ARR", "RCF"].includes(e.status_code || "") && ec === seg.to) ||
    (["MAN", "BKD"].includes(e.status_code || "") && ec === seg.from)
  );
}

function normalizeEventFields(ev: MilestoneEvent): MilestoneEvent {
  const e = { ...ev };
  if (e.date) e.date = normalizeEventDate(e.date) || e.date;
  if (e.departure_date) e.departure_date = normalizeEventDate(e.departure_date) || e.departure_date;
  if (e.arrival_date) e.arrival_date = normalizeEventDate(e.arrival_date) || e.arrival_date;
  if (e.estimated_date) e.estimated_date = normalizeEventDate(e.estimated_date) || e.estimated_date;
  const codeEmpty = !(e.status_code ?? "").trim() || (e.status_code ?? "") === "UNKN";
  if (codeEmpty && /\bscheduled\s+for\s+movement\b/i.test(`${e.status ?? ""} ${e.remarks ?? ""}`)) {
    e.status_code = "SFM";
  }

  return e;
}

function buildLegs(
  allEvents: MilestoneEvent[],
  origin: string,
  destination: string,
  excelLegs: ExcelLegInput[] = [],
): Leg[] {
  const depEvs = allEvents.filter(e => e.status_code === "DEP");
  const arrEvs = allEvents.filter(e => ["ARR", "DLV"].includes(e.status_code ?? ""));

  const arrByKey = new Map<string, MilestoneEvent>();
  const depByKey = new Map<string, MilestoneEvent>();
  for (const ev of arrEvs) {
    const s = parseSegmentFromEvent(ev);
    if (s) arrByKey.set(`${s.from}-${s.to}-${ev.flight || "NOFLIGHT"}`, ev);
  }
  for (const ev of depEvs) {
    const s = parseSegmentFromEvent(ev);
    if (s) depByKey.set(`${s.from}-${s.to}-${ev.flight || "NOFLIGHT"}`, ev);
  }
  for (const ev of allEvents.filter(e => ["BKD", "MAN"].includes(e.status_code ?? ""))) {
    const s = parseSegmentFromEvent(ev);
    if (s) depByKey.set(`${s.from}-${s.to}-${ev.flight || "NOFLIGHT"}`, ev);
  }

  const keys = new Set([...arrByKey.keys(), ...depByKey.keys()]);
  if (keys.size > 0) {
    const result: Leg[] = [];
    for (const key of keys) {
      const dep = depByKey.get(key);
      const arr = arrByKey.get(key);
      const seg =
        (dep && parseSegmentFromEvent(dep)) ||
        (arr && parseSegmentFromEvent(arr)) ||
        ({ from: origin, to: destination, service: "FLIGHT" } as SegmentInfo);
      const normFlight = normalizeFlight(dep?.flight ?? arr?.flight ?? null);
      const legScopedEvents = allEvents.filter(e => {
        const parsed = parseSegmentFromEvent(e);
        const sameSegment = parsed?.from === seg.from && parsed?.to === seg.to;
        const sameFlight = normFlight && normalizeFlight(e.flight) === normFlight;
        const strict = sameSegment && (!normFlight || sameFlight);
        return strict || (!!normFlight && eventBelongsToManifestLeg(seg, normFlight, e));
      });
      const scopedDep =
        legScopedEvents.find(e => e.status_code === "DEP" && e.date) ?? null;
      const scopedArr =
        legScopedEvents.find(e => ["ARR", "DLV"].includes(e.status_code || "") && e.date) ?? null;

      result.push({
        from: seg.from,
        to: seg.to,
        service: seg.service,
        flightNo: dep?.flight ?? arr?.flight ?? null,
        atd: scopedDep?.date ?? dep?.date ?? null,
        etd: seg.departureStr ?? null,
        ata: scopedArr?.date ?? arr?.date ?? null,
        eta: null,
        pieces: dep?.pieces ?? arr?.pieces ?? null,
        weight: dep?.weight ?? arr?.weight ?? null,
        events: legScopedEvents.length > 0 ? legScopedEvents : allEvents,
      });
    }
    for (const xl of excelLegs) {
      const xFrom = cleanCity(String(xl.from ?? ""));
      const xTo = cleanCity(String(xl.to ?? ""));
      if (!xFrom || !xTo) continue;
      const exists = result.some(l => l.from === xFrom && l.to === xTo);
      if (!exists) {
        result.push({
          from: xFrom,
          to: xTo,
          service: "FLIGHT",
          flightNo: xl.flight || null,
          atd: null,
          etd: null,
          ata: null,
          eta: null,
          pieces: null,
          weight: null,
          events: [],
        });
      }
    }
    const deduped = dedupeLegGraphEdges(result);
    deduped.sort((a, b) => {
      const ad = new Date(a.atd ?? a.etd ?? "").getTime();
      const bd = new Date(b.atd ?? b.etd ?? "").getTime();
      return (isNaN(ad) ? 0 : ad) - (isNaN(bd) ? 0 : bd);
    });
    return deduped;
  }

  const chronoEvs = [...allEvents].sort((a, b) => safeTime(a) - safeTime(b));
  let legs: Leg[] = [];
  const uniqueNormFlights = Array.from(
    new Set(chronoEvs.filter(e => e.flight).map(e => normalizeFlight(e.flight))),
  );

  for (const norm of uniqueNormFlights) {
    if (!norm) continue;
    const evs = chronoEvs.filter(e => normalizeFlight(e.flight) === norm);

    const flightInstances: MilestoneEvent[][] = [];
    let currentInstance: MilestoneEvent[] = [];
    let maxCycleSoFar = -1;

    for (const e of evs) {
      const idx = cycleOrder[e.status_code || ""] || 0;
      if ((idx === 3 || idx === 4) && maxCycleSoFar >= 5) {
        flightInstances.push(currentInstance);
        currentInstance = [];
        maxCycleSoFar = -1;
      }
      currentInstance.push(e);
      if (idx > maxCycleSoFar) maxCycleSoFar = idx;
    }
    if (currentInstance.length > 0) flightInstances.push(currentInstance);

    for (let instIdx = 0; instIdx < flightInstances.length; instIdx++) {
      const fltEvs = flightInstances[instIdx];
      const fltStr = fltEvs.find(e => e.flight)?.flight || norm;
      const fltPath: string[] = [];

      const firstDepLoc = cleanCity(fltEvs.find(e => e.status_code === "DEP")?.location);
      if (firstDepLoc) fltPath.push(firstDepLoc);
      else if (cleanCity(origin)) fltPath.push(cleanCity(origin)!);

      for (const e of fltEvs) {
        const loc = cleanCity(e.location);
        if (loc && loc !== fltPath[fltPath.length - 1] && (e.status_code === "DEP" || e.status_code === "ARR")) {
          fltPath.push(loc);
        }
      }

      const pureFltPath = fltPath.filter((loc, i, arr) => i === 0 || loc !== arr[i - 1]);

      const hasDepOrArrMovement = fltEvs.some(
        e => e.status_code === "DEP" || e.status_code === "ARR" || e.status_code === "DLV",
      );

      if (pureFltPath.length === 1) {
        const xlSeg = excelRouteForNormalizedFlight(norm, excelLegs);
        // Connect flight with only bookings (BKD/MAN/RCS at hub) — do not stitch from shipment origin?
        // Wrong: TLV + BKD@BKK produced a phantom TLV→BKK for the *next* carrier's flight number.
        if (xlSeg && !hasDepOrArrMovement) {
          pureFltPath.length = 0;
          pureFltPath.push(xlSeg.from, xlSeg.to);
        } else {
          const lastLoc = cleanCity(
            [...fltEvs].reverse().find(e => {
              const lc = cleanCity(e.location);
              return lc && lc !== pureFltPath[0] && lc;
            })?.location,
          );
          const destCity = cleanCity(destination);
          if (!hasDepOrArrMovement && lastLoc && destCity && lastLoc !== destCity) {
            pureFltPath.length = 0;
            pureFltPath.push(lastLoc, destCity);
          } else if (lastLoc) {
            pureFltPath.push(lastLoc);
          } else {
            const matchingXl = excelLegs.find(xl => cleanCity(String(xl.from)) === pureFltPath[0]);
            if (matchingXl && cleanCity(String(matchingXl.to)))
              pureFltPath.push(cleanCity(String(matchingXl.to))!);
            else if (cleanCity(destination) && pureFltPath[0] !== cleanCity(destination)) {
              pureFltPath.push(cleanCity(destination)!);
            }
          }
        }
      }

      for (let i = 0; i < pureFltPath.length - 1; i++) {
        legs.push({
          from: pureFltPath[i],
          to: pureFltPath[i + 1],
          service: "FLIGHT",
          flightNo: fltStr,
          atd: null,
          etd: null,
          ata: null,
          eta: null,
          pieces: null,
          weight: null,
          events: fltEvs,
        });
      }
    }
  }

  for (const xl of excelLegs) {
    const xFrom = cleanCity(String(xl.from ?? ""));
    const xTo = cleanCity(String(xl.to ?? ""));
    const exists = legs.some(l => l.from === xFrom && l.to === xTo);
    if (!exists && xFrom && xTo) {
      legs.push({
        from: xFrom,
        to: xTo,
        service: "FLIGHT",
        flightNo: xl.flight || null,
        atd: null,
        etd: null,
        ata: null,
        eta: null,
        pieces: null,
        weight: null,
        events: [],
      });
    }
  }

  if (legs.length === 0) {
    const path: string[] = [cleanCity(origin) || origin];
    for (const e of chronoEvs) {
      const loc = cleanCity(e.location);
      if (e.status_code === "DEP" && loc && loc !== path[path.length - 1]) path.push(loc);
    }
    if (cleanCity(destination) && path[path.length - 1] !== cleanCity(destination)) path.push(cleanCity(destination)!);
    const purePath = path.filter((loc, i, arr) => i === 0 || loc !== arr[i - 1]);
    for (let i = 0; i < purePath.length - 1; i++) {
      legs.push({
        from: purePath[i],
        to: purePath[i + 1],
        service: "FLIGHT",
        flightNo: null,
        atd: null,
        etd: null,
        ata: null,
        eta: null,
        pieces: null,
        weight: null,
        events: allEvents,
      });
    }
  }

  legs = dedupeLegGraphEdges(legs);

  legs.sort((a, b) => {
    const aEv = allEvents.find(
      e =>
        (!e.flight || !a.flightNo || normalizeFlight(e.flight) === normalizeFlight(a.flightNo)) &&
        (cleanCity(e.location) === a.from || cleanCity(e.location) === a.to),
    );
    const bEv = allEvents.find(
      e =>
        (!e.flight || !b.flightNo || normalizeFlight(e.flight) === normalizeFlight(b.flightNo)) &&
        (cleanCity(e.location) === b.from || cleanCity(e.location) === b.to),
    );
    return safeTime(aEv) - safeTime(bEv);
  });

  if (legs.length === 0) {
    legs.push({
      from: origin,
      to: destination,
      service: "FLIGHT",
      flightNo: null,
      atd: null,
      etd: null,
      ata: null,
      eta: null,
      pieces: null,
      weight: null,
      events: allEvents,
    });
  }

  return legs;
}

function buildFlows(legs: Leg[], origin: string): Leg[][] {
  if (legs.length === 0) return [];

  const starts = legs.filter(l => cleanCity(l.from) === cleanCity(origin));
  if (starts.length === 0) {
    const allTos = new Set(legs.map(l => cleanCity(l.to)));
    const noPreds = legs.filter(l => !allTos.has(cleanCity(l.from)));
    starts.push(...(noPreds.length > 0 ? noPreds : [legs[0]]));
  }

  const flows: Leg[][] = [];

  function traverse(currentPath: Leg[]) {
    const lastLeg = currentPath[currentPath.length - 1];
    const nextLegs = legs.filter(l => cleanCity(l.from) === cleanCity(lastLeg.to) && !currentPath.includes(l));

    if (nextLegs.length === 0) flows.push(currentPath);
    else for (const next of nextLegs) traverse([...currentPath, next]);
  }

  for (const start of starts) traverse([start]);

  const seenFirstLegs = new Set<string>();
  const filteredFlows: Leg[][] = [];
  flows.sort((a, b) => b.length - a.length);

  for (const flow of flows) {
    const startLeg = flow[0];
    const repDateStr =
      startLeg.events && startLeg.events.length > 0
        ? String(new Date(startLeg.events[0].date || 0).getDate())
        : "NODATE";
    const legKey = `${startLeg.to}-${startLeg.flightNo || "NOFLIGHT"}-${repDateStr}`;
    if (!seenFirstLegs.has(legKey)) {
      seenFirstLegs.add(legKey);
      filteredFlows.push(flow);
    }
  }

  return filteredFlows;
}

function excelLegArray(excelLegs: ExcelLegInput[]): ExcelLegInput[] {
  return Array.isArray(excelLegs) ? excelLegs : [];
}

/** Match importer / planned routing for this flight — critical when only BKD/MAN scans exist */
function excelRouteForNormalizedFlight(norm: string, excelLegsRaw: ExcelLegInput[]): SegmentInfo | null {
  const legs = excelLegArray(excelLegsRaw);
  for (const xl of legs) {
    const xf = normalizeFlight(xl.flight || undefined);
    if (!xf || xf !== norm) continue;
    const from = cleanCity(String(xl.from ?? ""));
    const to = cleanCity(String(xl.to ?? ""));
    if (!from || !to) continue;
    return { from, to, service: "FLIGHT", departureStr: null };
  }
  return null;
}

function parseNullablePiecesCount(val?: string | null): number | null {
  if (val == null || val === "") return null;
  const m = String(val).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function hasUnloadSignal(ev: MilestoneEvent): boolean {
  const hay = `${ev.status_code ?? ""} ${ev.status ?? ""} ${ev.remarks ?? ""}`.toLowerCase();
  return /\bunload|offload|offloaded|short.?shipped|shipment removed|cargo removed\b/.test(hay);
}

function mergeEventOverrides(base: MilestoneEvent | undefined, overrides: Partial<MilestoneEvent>): MilestoneEvent {
  const b = base ?? {};
  return {
    ...b,
    ...overrides,
    date: overrides.date ?? b.date,
    status_code: overrides.status_code ?? b.status_code,
    location: overrides.location ?? b.location,
  };
}

/** Events attributable to `leg`'s endpoints and flight — matches buildStepsForFlow scoping */
function eventsMatchingLegEndpoints(leg: Leg): MilestoneEvent[] {
  return leg.events.filter(e => {
    const isMatch = (target: string) => {
      if (!target) return true;
      const upperLoc = (e.location || "").toUpperCase();
      const upperTarget = target.toUpperCase();
      if (!upperLoc) return true;
      if (cleanCity(e.location) === upperTarget) return true;
      if (upperLoc.startsWith(upperTarget)) return true;
      const regex = new RegExp(`\\b${upperTarget}\\b`);
      return regex.test(upperLoc);
    };
    const locMatch = isMatch(leg.from) || isMatch(leg.to);
    const flightMatch =
      !e.flight || !leg.flightNo || normalizeFlight(e.flight) === normalizeFlight(leg.flightNo);
    return locMatch && flightMatch;
  });
}

/** Past confirmed DEP on a leg segment with no matching inbound carrier scan at that leg's arrival station yet. */
function deriveAirborneInTransitPhrase(flowLegs: Leg[], airlinePool: MilestoneEvent[], nowMs: number): string | null {
  let phrase: string | null = null;
  for (const leg of flowLegs) {
    if (!leg.from?.trim?.() || !leg.to?.trim?.() || leg.from === "???" || leg.to === "???") continue;

    const legEvents = eventsMatchingLegEndpoints(leg);
    const depEv =
      legEvents.find(e => e.status_code === "DEP" && e.date && cleanCity(e.location ?? "") === leg.from) ??
      null;
    const depMs = depEv ? safeTime(depEv) : 0;
    if (!depMs || depMs >= nowMs) continue;

    const legDest = cleanCity(leg.to);
    const legFl = normalizeFlight(leg.flightNo || undefined);
    const inboundAtDestination = airlinePool.some(e => {
      if (!["ARR", "DLV", "RCF"].includes(e.status_code ?? "")) return false;
      if (cleanCity(e.location ?? "") !== legDest) return false;
      const t = safeTime(e);
      if (!t || t + 60_000 < depMs) return false;
      const ef = normalizeFlight(e.flight);
      if (!ef || !legFl) return true;
      return ef === legFl;
    });
    if (inboundAtDestination) continue;

    const o = cleanCity(leg.from) || leg.from;
    const d = cleanCity(leg.to) || leg.to;
    phrase = `Departed ${o}, in transit to ${d}`;
  }
  return phrase;
}

function buildStepsForFlow(
  flowLegs: Leg[],
  events: MilestoneEvent[],
  originDisp: string,
  destDisp: string,
  excelLegsRaw: ExcelLegInput[],
): MilestoneProjectionStep[] {
  const steps: MilestoneProjectionStep[] = [];
  const presentCodes = new Set(events.map(e => e.status_code ?? ""));
  const destinationGroundReached = ["NFD", "AWD", "DLV"].some(c => presentCodes.has(c));
  const destinationArrived = events.some(e => e.status_code === "ARR" && cleanCity(e.location) === cleanCity(destDisp));
  const excelLegs = excelLegArray(excelLegsRaw);

  const originFromCodes = ["BKD", "RCS", "FOH", "DIS", "130"];
  const originDone = originFromCodes.some(c => presentCodes.has(c));
  const originEv =
    events.find(e => originFromCodes.includes(e.status_code ?? "") && (e.date || e.departure_date)) ??
    events.find(e => originFromCodes.includes(e.status_code ?? ""));

  steps.push({
    kind: "node",
    code: "RCS",
    label: "Ground service",
    desc: `Origin: ${originDisp}`,
    done: originDone,
    active: originDone && !presentCodes.has("DEP") && !destinationGroundReached && !destinationArrived,
    location: originDisp,
    ...(originEv
      ? {
          date: originEv.date,
          estimated_date: originEv.estimated_date ?? undefined,
          departure_date: originEv.departure_date,
          arrival_date: originEv.arrival_date,
          status_code: originEv.status_code,
          flight: originEv.flight,
          pieces: originEv.pieces ?? undefined,
          weight: originEv.weight ?? undefined,
        }
      : {}),
  } as MilestoneProjectionNode);

  for (let i = 0; i < flowLegs.length; i++) {
    const leg = flowLegs[i];
    const repEv =
      leg.events.find(e => e.status_code === "DEP" && e.date) ||
      leg.events.find(e => ["ARR", "RCF"].includes(e.status_code || "") && e.date) ||
      leg.events[0];
    const repTime = safeTime(repEv);

    let bestXl: ExcelLegInput | null = null;
    let minDiff = Infinity;
    for (const xl of excelLegs) {
      if (cleanCity(String(xl.from)) === leg.from && cleanCity(String(xl.to)) === leg.to) {
        const xlFlt = normalizeFlight(xl.flight || undefined);
        const trkFlt = normalizeFlight(leg.flightNo || undefined);
        if (!xlFlt || !trkFlt || xlFlt === trkFlt) {
          const xlTime = new Date((xl.etd ?? xl.eta ?? "") as string || 0).getTime();
          if (xlTime > 0 && repTime > 0) {
            const diff = Math.abs(xlTime - repTime);
            if (diff < minDiff) {
              minDiff = diff;
              bestXl = xl;
            }
          } else if (!bestXl) bestXl = xl;
        }
      }
    }

    const xlEtd = bestXl?.etd ?? null;
    const xlEta = bestXl?.eta ?? null;
    const xlPieces = bestXl && (bestXl as any).pieces != null ? String((bestXl as any).pieces) : undefined;
    const xlWeight = bestXl && (bestXl as any).weight != null ? String((bestXl as any).weight) : undefined;

    const legEvents = eventsMatchingLegEndpoints(leg);

    const depConfirmedOnLeg = legEvents.some(e => e.status_code === "DEP" && e.date);
    const arrReachedThisLegDestination = legEvents.some(
      e =>
        ["ARR", "DLV"].includes(e.status_code || "") &&
        !!e.date &&
        cleanCity(e.location) === leg.to,
    );
    const arrConfirmedOnLeg = arrReachedThisLegDestination;
    const preDepartureScanOnLeg =
      legEvents.some(e => ["MAN", "BKD"].includes(e.status_code ?? "") && e.date) &&
      !depConfirmedOnLeg &&
      !arrConfirmedOnLeg;

    const takeOffDone = depConfirmedOnLeg || arrReachedThisLegDestination;
    const landingDone =
      arrReachedThisLegDestination ||
      (i === flowLegs.length - 1 && events.some(e => e.status_code === "DLV" && e.date));

    const depEv =
      legEvents.find(e => e.status_code === "DEP" && e.date) ||
      legEvents.find(e => e.status_code === "DEP") ||
      legEvents.find(e => e.status_code === "BKD") ||
      legEvents.find(e => ["MAN", "RCS"].includes(e.status_code ?? ""));
    const arrEv =
      legEvents.find(e => ["ARR", "DLV"].includes(e.status_code ?? "") && e.date) ||
      legEvents.find(e => ["ARR", "DLV"].includes(e.status_code ?? ""));

    steps.push({ kind: "arrow", done: takeOffDone });

    const legPcsFloor = maxAirlinePiecesForLeg(leg, events);
    const depMerged = depEv ? mergeEventOverrides(depEv, { location: leg.from, pieces: xlPieces || depEv.pieces }) : undefined;
    const depPiecesNum = Math.max(
      extractPiecesCount(xlPieces),
      extractPiecesCount(depMerged?.pieces),
      legPcsFloor,
    );
    const depPiecesOut = depPiecesNum > 0 ? String(depPiecesNum) : undefined;
    steps.push({
      kind: "node",
      code: "DEP",
      label: "Take off",
      desc: leg.flightNo ? `Flight ${leg.flightNo}` : "Flight",
      done: takeOffDone,
      active:
        (takeOffDone && !landingDone && !destinationGroundReached && !destinationArrived) ||
        (preDepartureScanOnLeg && !destinationGroundReached && !destinationArrived),
      location: leg.from,
      status_code: depMerged?.status_code,
      flight: depMerged?.flight,
      pieces: depPiecesOut,
      weight: xlWeight ?? depMerged?.weight ?? undefined,
      date: depMerged?.date ?? leg.atd ?? leg.etd ?? undefined,
      estimated_date: depMerged?.estimated_date ?? undefined,
      departure_date: depMerged?.departure_date ?? undefined,
      arrival_date: depMerged?.arrival_date ?? undefined,
      excelEtd: xlEtd,
    });

    steps.push({ kind: "arrow", done: landingDone });

    const arrMerged = arrEv ? mergeEventOverrides(arrEv, { location: leg.to, pieces: xlPieces || arrEv.pieces }) : undefined;
    const arrPiecesNum = Math.max(
      extractPiecesCount(xlPieces),
      extractPiecesCount(arrMerged?.pieces),
      legPcsFloor,
    );
    const arrPiecesOut = arrPiecesNum > 0 ? String(arrPiecesNum) : undefined;

    steps.push({
      kind: "node",
      code: "ARR",
      label: "Landing",
      desc: `Arrived at ${leg.to}`,
      done: landingDone,
      active: landingDone && !destinationGroundReached && !(i < flowLegs.length - 1),
      location: leg.to,
      status_code: arrMerged?.status_code,
      flight: arrMerged?.flight,
      pieces: arrPiecesOut,
      weight: xlWeight ?? arrMerged?.weight ?? undefined,
      date: arrMerged?.date ?? undefined,
      estimated_date: arrMerged?.estimated_date ?? undefined,
      departure_date: arrMerged?.departure_date ?? undefined,
      arrival_date: arrMerged?.arrival_date ?? undefined,
      excelEta: xlEta,
    });

    if (i < flowLegs.length - 1) {
      const transitCodes = ["RCF", "NFD", "RCS", "RCT", "ARR"];
      const transitEvs = events.filter(e => e.location === leg.to);
      const tCodes = new Set(transitEvs.map(e => e.status_code ?? ""));
      const nextLeg = flowLegs[i + 1];
      const nextLegManifestOnly =
        nextLeg &&
        nextLeg.events.some(e => e.status_code === "MAN" && e.date) &&
        !nextLeg.events.some(e => e.status_code === "DEP" && e.date) &&
        !nextLeg.events.some(e => ["ARR", "DLV"].includes(e.status_code || "") && e.date);
      const nextLegTakeOff =
        i < flowLegs.length - 1 &&
        (nextLeg?.events.some(e => e.status_code === "DEP" && !!e.date) || !!nextLegManifestOnly);
      const transitDone = transitCodes.some(c => tCodes.has(c)) || landingDone;
      const transitEv = transitEvs.find(e => transitCodes.includes(e.status_code ?? ""));

      steps.push({ kind: "arrow", done: transitDone });

      steps.push({
        kind: "node",
        code: "RCF",
        label: "Ground service",
        desc: `Transit: ${leg.to}`,
        done: transitDone,
        active: transitDone && !nextLegTakeOff && !destinationGroundReached && !destinationArrived,
        location: leg.to,
        date: transitEv?.date,
        status_code: transitEv?.status_code,
        flight: transitEv?.flight,
        pieces: transitEv?.pieces ?? undefined,
      });
    }
  }

  const destDone = destinationGroundReached;
  const latestEventForCodes = (codes: string[]) =>
    [...events]
      .filter(e => codes.includes(e.status_code ?? ""))
      .sort((a, b) => safeTime(b) - safeTime(a))[0];
  const destEv =
    latestEventForCodes(["DLV"]) ??
    latestEventForCodes(["AWD"]) ??
    latestEventForCodes(["NFD"]);
  const destNodeCode = destEv?.status_code === "NFD" || destEv?.status_code === "AWD" ? destEv.status_code : "DLV";
  const destNodeDesc =
    destEv?.status_code === "NFD"
      ? (destEv.status || "Notified for Delivery")
      : destEv?.status_code === "AWD"
        ? (destEv.status || "Documents Delivered")
        : "Final Delivery";

  const maxFed = maxPiecesAcrossEvents(events);
  const summedPartialsAtDest = summedDestinationTerminalPieces(events, destDisp, maxFed);
  const latestTerminalPcs = extractPiecesCount(destEv?.pieces ?? destEv?.actual_pieces);
  const destPiecesNum = Math.max(maxFed, summedPartialsAtDest, latestTerminalPcs);
  const destPiecesOut = destPiecesNum > 0 ? String(destPiecesNum) : undefined;

  if (flowLegs.length > 0) {
    steps.push({ kind: "arrow", done: destDone });

    steps.push({
      kind: "node",
      code: destNodeCode,
      label: "Ground service",
      desc: destNodeDesc,
      done: destDone,
      active: destDone,
      location: destDisp,
      date: destEv?.date,
      status_code: destEv?.status_code,
      flight: destEv?.flight,
      pieces: destPiecesOut,
      weight: destEv?.weight,
    });
  }

  return steps;
}

/** Strip undefined / compress for stable logging */
export function fingerprintProjection(proj: MilestoneProjection): string {
  return proj.flows_steps
    .map(flow => flow.map(s => (s.kind === "arrow" ? `a:${s.done}` : `n:${s.code}:${s.done}:${s.active}`)).join("|"))
    .join(";");
}

function resolveOriginDestination(
  events: MilestoneEvent[],
  excelLegs: ExcelLegInput[],
  dataOrigin?: string | null,
  dataDest?: string | null,
): { origin: string; destination: string; trace: string[] } {
  const trace: string[] = [];
  let origin = cleanCity(dataOrigin ?? null);
  let destination = cleanCity(dataDest ?? null);

  if ((!origin || !destination) && excelLegs.length > 0) {
    origin = origin || cleanCity(String(excelLegs[0].from ?? ""));
    destination = destination || cleanCity(String(excelLegs[excelLegs.length - 1].to ?? ""));
    if (origin || destination) trace.push("excel:origin_dest_fallback");
  }

  const chrono = [...events].sort((a, b) => safeTime(a) - safeTime(b));
  if (!origin) {
    const firstWithLoc = chrono.find(e => cleanCity(e.location));
    origin = firstWithLoc ? cleanCity(firstWithLoc.location) : null;
    if (origin) trace.push("event:scan_origin");
  }
  if (!destination) {
    const lastWithLoc = [...events].sort((a, b) => safeTime(b) - safeTime(a)).find(e => {
      const loc = cleanCity(e.location);
      if (!loc) return false;
      if (origin && loc === origin && (e.status_code === "DEP" || e.status_code === "RCS")) return false;
      return true;
    });
    destination = lastWithLoc ? cleanCity(lastWithLoc.location) : null;
    if (destination) trace.push("event:scan_destination");
  }

  origin = origin || "???";
  destination = destination || "???";
  return { origin, destination, trace };
}

/**
 * Canonical milestone projection — single compilation target for persisted + API responses.
 */
export function computeMilestoneProjection(payload: {
  events: MilestoneEvent[];
  origin?: string | null;
  destination?: string | null;
  status?: string | null;
  excelLegs?: ExcelLegInput[] | null;
  /** From import / raw_meta.pieces — when 1, phantom multi-path graphs collapse to one itinerary. */
  excelPiecesHint?: string | number | null;
  /** Test / deterministic comparisons only — compares DEP timestamps vs this instant for airborne wording. */
  referenceTimeMs?: number | null;
}): MilestoneProjection {
  const events = payload.events.map(normalizeEventFields);
  const excelLegs = excelLegArray((payload.excelLegs ?? []) as ExcelLegInput[]);
  const { origin: originDisp, destination: destDisp, trace } = resolveOriginDestination(
    events,
    excelLegs,
    payload.origin,
    payload.destination,
  );

  const groundEvents = events.filter(
    e =>
      e.source === "maman" ||
      e.source === "swissport" ||
      (e.location?.includes("MAMAN") ?? false) ||
      (e.location?.includes("Swissport") ?? false),
  );

  const airlineEvents = events.filter(e => !groundEvents.includes(e));
  const legs = buildLegs(airlineEvents.length > 0 ? airlineEvents : events, originDisp, destDisp, excelLegs);
  const rawFlows = buildFlows(legs, originDisp);

  const shipmentHasTransit = events.some(e => ["DEP", "ARR", "MAN", "RCF"].includes(e.status_code || ""));

  const keepFlowAfterUnload = (flow: Leg[]): boolean => {
    const isUnloaded = flow.some(ln => {
      if (!ln.events || ln.events.length === 0) return false;
      const parsedPieces = ln.events
        .map(e => parseNullablePiecesCount(e.pieces ?? e.actual_pieces))
        .filter((n): n is number => n !== null);
      if (parsedPieces.length === 0) return false;
      const allZeroPieces = parsedPieces.every(n => n === 0);
      const explicitUnload = ln.events.some(hasUnloadSignal);
      // Avoid pruning valid delivered/landed paths that happen to report 0 pieces.
      return allZeroPieces && explicitUnload;
    });
    if (isUnloaded) return false;
    if (shipmentHasTransit) {
      const flowHasTransit = flow.some(ln =>
        ln.events.some(e => ["DEP", "ARR", "MAN", "RCF"].includes(e.status_code || "")),
      );
      if (!flowHasTransit) return false;
    }
    return true;
  };

  let flows = rawFlows.filter(keepFlowAfterUnload);
  const failedUnloadFlows = rawFlows.filter(f => !keepFlowAfterUnload(f));

  const excelHint = parseExcelPiecesHint(payload.excelPiecesHint);
  const maxPcsEvt = Math.max(0, ...events.map(e => extractPiecesCount(e.pieces ?? e.actual_pieces)));
  // If carrier events report 0/unknown pieces, keep pathing conservative to avoid
  // phantom graph fan-out on single-shipment HAWBs. Do not trust excel "1" when
  // the airline feed already shows multiple pieces (common HAWB import noise).
  const treatAsSinglePiece =
    (excelHint === 1 && maxPcsEvt <= 1) || (excelHint == null && maxPcsEvt <= 1);

  let collapseSingleTrace: string | null = null;
  if (treatAsSinglePiece && flows.length > 1) {
    const nBefore = flows.length;
    flows = collapseToSinglePieceFlow(flows, destDisp, airlineEvents.length > 0 ? airlineEvents : events);
    collapseSingleTrace = `collapse:single_piece_${nBefore}_to_1`;
  }

  const failedFlows = failedUnloadFlows;

  const isDlv =
    events.some(e => e.status_code === "DLV") ||
    payload.status === "Delivered" ||
    payload.status === "Delivered to origin";
  const isErr = payload.status === "Partial/Ground Error" || payload.status === "Error";

  const maxPcs = Math.max(0, ...events.map(e => extractPiecesCount(e.pieces ?? e.actual_pieces)));

  const hasMaman = groundEvents.some(e => e.location?.includes("MAMAN") || e.source === "maman");
  const hasSwissport = groundEvents.some(e => e.location?.includes("Swissport") || e.source === "swissport");
  const parts: string[] = [];
  if (hasMaman) parts.push("Maman");
  if (hasSwissport) parts.push("Swissport");

  const failed_route_summaries: MilestoneFailedRouteSummary[] = failedFlows.map(f => {
    const firstLeg = f[0];
    const firstEv = firstLeg?.events?.[0];
    const depTime = firstEv?.date
      ? new Date(firstEv.date).toISOString().slice(0, 16)
      : "Unknown";
    return {
      routeText: f.map(l => `${l.from} ➔ ${l.to}`).join(" , "),
      flightNo: firstLeg?.flightNo || "Unknown",
      plannedHint: depTime,
    };
  });

  let flows_steps = flows.map(fl => buildStepsForFlow(fl, events, originDisp, destDisp, excelLegs));
  let terminalCollapseTrace: string | null = null;
  const terminalDestinationReached = events.some(e => ["NFD", "AWD", "DLV"].includes(e.status_code || ""));
  if (terminalDestinationReached && flows_steps.length > 1) {
    const flowScore = (steps: MilestoneProjectionStep[]) => {
      const nodes = steps.filter((s): s is MilestoneProjectionNode => s.kind === "node");
      const incomplete = nodes.filter(n => !n.done).length;
      const done = nodes.filter(n => n.done).length;
      const terminal = nodes.some(n => ["NFD", "AWD", "DLV"].includes(n.code) && n.active) ? 1 : 0;
      // Prefer the fully evidenced carrier path once destination ground handling is reached.
      return terminal * 10000 + done * 100 - incomplete * 1000 - nodes.length;
    };
    let bestIdx = 0;
    let bestScore = flowScore(flows_steps[0]);
    for (let i = 1; i < flows_steps.length; i++) {
      const score = flowScore(flows_steps[i]);
      if (score > bestScore) {
        bestIdx = i;
        bestScore = score;
      }
    }
    terminalCollapseTrace = `collapse:terminal_destination_${flows_steps.length}_to_1`;
    flows = [flows[bestIdx]];
    flows_steps = [flows_steps[bestIdx]];
  }

  const terminalGroundReached = events.some(e =>
    ["NFD", "AWD", "DLV"].includes(e.status_code || ""),
  );
  let overallStatus = deriveOverallStatus(events, payload.status, isDlv);
  const referenceTimeMs = payload.referenceTimeMs ?? Date.now();
  const airlinePoolForTransit = events.filter(e => !isGroundHandlerTimelineNoise(e));
  if (!isErr && !isDlv && flows.length === 1 && !terminalGroundReached) {
    const airborne = deriveAirborneInTransitPhrase(flows[0], airlinePoolForTransit, referenceTimeMs);
    if (airborne) overallStatus = airborne;
  }

  const interpretation_trace = [
    ...trace,
    `events:${events.length}`,
    ...(airlineEvents.length > 0 ? ["prefer:airline_leg_builder"] : ["prefer:full_event_leg_builder"]),
    `flows_kept:${flows.length}`,
    `flows_failed_unload:${failedFlows.length}`,
    ...(collapseSingleTrace ? [collapseSingleTrace] : []),
    ...(terminalCollapseTrace ? [terminalCollapseTrace] : []),
    ...(failedUnloadFlows.length > 0 ? ["pruned:unload_or_no_transit"] : []),
  ];

  try {
    if (process.env.MILESTONE_SHADOW_LOG === "1") {
      
      console.log("[milestone_projection]", fingerprintProjection({
        milestone_projection_version: MILESTONE_PROJECTION_VERSION,
        schedule_policy_version: SCHEDULE_POLICY_VERSION,
        interpretation_trace,
        origin_display: originDisp,
        dest_display: destDisp,
        flows_steps,
        failed_route_summaries,
        meta: {
          paths_count: flows.length,
          has_maman: hasMaman,
          has_swissport: hasSwissport,
          is_dlv: isDlv,
          is_err: isErr,
          overall_status: overallStatus,
          max_pieces: maxPcs,
          ground_handlers_label: parts.join(" & "),
        },
      }));
    }
  } catch {
    /* ignore */
  }

  return {
    milestone_projection_version: MILESTONE_PROJECTION_VERSION,
    schedule_policy_version: SCHEDULE_POLICY_VERSION,
    interpretation_trace,
    origin_display: originDisp,
    dest_display: destDisp,
    flows_steps,
    failed_route_summaries,
    meta: {
      paths_count: flows.length,
      has_maman: hasMaman,
      has_swissport: hasSwissport,
      is_dlv: isDlv,
      is_err: isErr,
      overall_status: overallStatus,
      max_pieces: maxPcs,
      ground_handlers_label: parts.join(" & "),
    },
  };
}

/** Attach `milestone_projection` + version headers on any tracking-shaped payload before JSON. */
export function enrichTrackingPayloadWithMilestone(payload: Record<string, any>): void {
  const events = (payload.events ?? []) as MilestoneEvent[];
  const excelLegs = (payload.raw_meta?.excel_legs ?? []) as ExcelLegInput[];

  payload.milestone_projection = computeMilestoneProjection({
    events,
    origin: payload.origin ?? null,
    destination: payload.destination ?? null,
    status: payload.status ?? null,
    excelLegs,
    excelPiecesHint: payload.raw_meta?.pieces as string | number | undefined,
  });

  void import("newrelic")
    .then(m => {
      m.default?.recordMetric?.(
        "Custom/MilestoneProjection/Flows",
        payload.milestone_projection?.meta?.paths_count ?? 0,
      );
    })
    .catch(() => {
      /* New Relic not loaded in dev */
    });
}
