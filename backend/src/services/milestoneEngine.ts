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
  BKD: 1, RCS: 2, FOH: 2, DIS: 2, MAN: 3, DEP: 4, ARR: 5, RCF: 6, NFD: 7, AWD: 8, DLV: 9,
};

function safeTime(e?: MilestoneEvent | null): number {
  const d = e?.date || e?.estimated_date;
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

function normalizeFlight(f?: string | null): string | null {
  if (!f) return null;
  const m = f.replace(/\s+/g, "").toUpperCase().match(/^([A-Z]{2,3})0*(\d{1,4})$/);
  return m ? `${m[1]}${m[2]}` : f.replace(/\s+/g, "").toUpperCase();
}

function parseSegmentRemark(remarks?: string | null): SegmentInfo | null {
  if (!remarks) return null;
  const seg = remarks.match(/Segment:\s*([A-Z]{2,4})\s+to\s+([A-Z]{2,4})/i);
  const svc = remarks.match(/Service:\s*([A-Z]+)/i);
  const dep = remarks.match(/Departure:\s*(.+?)(?:$|\n)/i);
  if (!seg) return null;
  return {
    from: seg[1].toUpperCase(),
    to: seg[2].toUpperCase(),
    service: (svc?.[1] ?? "FLIGHT").toUpperCase(),
    departureStr: dep?.[1]?.trim() ?? null,
  };
}

function normalizeEventFields(ev: MilestoneEvent): MilestoneEvent {
  const e = { ...ev };
  if (e.date) e.date = normalizeEventDate(e.date) || e.date;
  if (e.departure_date) e.departure_date = normalizeEventDate(e.departure_date) || e.departure_date;
  if (e.arrival_date) e.arrival_date = normalizeEventDate(e.arrival_date) || e.arrival_date;
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
    const s = parseSegmentRemark(ev.remarks);
    if (s) arrByKey.set(`${s.from}-${s.to}-${ev.flight || "NOFLIGHT"}`, ev);
  }
  for (const ev of depEvs) {
    const s = parseSegmentRemark(ev.remarks);
    if (s) depByKey.set(`${s.from}-${s.to}-${ev.flight || "NOFLIGHT"}`, ev);
  }

  const keys = new Set([...arrByKey.keys(), ...depByKey.keys()]);
  if (keys.size > 0) {
    const result: Leg[] = [];
    for (const key of keys) {
      const dep = depByKey.get(key);
      const arr = arrByKey.get(key);
      const seg =
        parseSegmentRemark(dep?.remarks ?? arr?.remarks) ??
        ({ from: origin, to: destination, service: "FLIGHT" } as SegmentInfo);
      result.push({
        from: seg.from,
        to: seg.to,
        service: seg.service,
        flightNo: dep?.flight ?? arr?.flight ?? null,
        atd: dep?.date ?? null,
        etd: seg.departureStr ?? null,
        ata: arr?.date ?? null,
        eta: null,
        pieces: dep?.pieces ?? arr?.pieces ?? null,
        weight: dep?.weight ?? arr?.weight ?? null,
        events: allEvents,
      });
    }
    result.sort((a, b) => {
      const ad = new Date(a.atd ?? a.etd ?? "").getTime();
      const bd = new Date(b.atd ?? b.etd ?? "").getTime();
      return (isNaN(ad) ? 0 : ad) - (isNaN(bd) ? 0 : bd);
    });
    return result;
  }

  const chronoEvs = [...allEvents].sort((a, b) => safeTime(a) - safeTime(b));
  const legs: Leg[] = [];
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

      if (pureFltPath.length === 1) {
        const lastLoc = cleanCity([...fltEvs].reverse().find(e => {
          const lc = cleanCity(e.location);
          return lc && lc !== pureFltPath[0] && lc;
        })?.location);
        if (lastLoc) {
          pureFltPath.push(lastLoc);
        } else {
          const matchingXl = excelLegs.find(xl => cleanCity(String(xl.from)) === pureFltPath[0]);
          if (matchingXl && cleanCity(String(matchingXl.to))) pureFltPath.push(cleanCity(String(matchingXl.to))!);
          else if (cleanCity(destination) && pureFltPath[0] !== cleanCity(destination)) {
            pureFltPath.push(cleanCity(destination)!);
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
        events: allEvents,
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

function buildStepsForFlow(
  flowLegs: Leg[],
  events: MilestoneEvent[],
  originDisp: string,
  destDisp: string,
  excelLegsRaw: ExcelLegInput[],
): MilestoneProjectionStep[] {
  const steps: MilestoneProjectionStep[] = [];
  const presentCodes = new Set(events.map(e => e.status_code ?? ""));
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
    active: originDone && !presentCodes.has("DEP"),
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

    const legEvents = leg.events.filter(e => {
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

    const takeOffDone =
      legEvents.some(e => e.status_code === "DEP" && e.date) ||
      legEvents.some(e => ["ARR", "DLV"].includes(e.status_code || "") && e.date) ||
      events.some(e => ["ARR", "DLV"].includes(e.status_code || "") && e.date);
    const landingDone =
      legEvents.some(e => ["ARR", "DLV"].includes(e.status_code || "") && e.date) ||
      events.some(e => e.status_code === "DLV" && e.date);

    const depEv =
      legEvents.find(e => e.status_code === "DEP" && e.date) ||
      legEvents.find(e => e.status_code === "DEP") ||
      legEvents.find(e => e.status_code === "BKD") ||
      legEvents.find(e => ["MAN", "RCS"].includes(e.status_code ?? ""));
    const arrEv =
      legEvents.find(e => ["ARR", "DLV", "RCT"].includes(e.status_code ?? "") && e.date) ||
      legEvents.find(e => ["ARR", "DLV", "RCT"].includes(e.status_code ?? ""));

    steps.push({ kind: "arrow", done: takeOffDone });

    const depMerged = depEv ? mergeEventOverrides(depEv, { location: leg.from, pieces: xlPieces || depEv.pieces }) : undefined;
    steps.push({
      kind: "node",
      code: "DEP",
      label: "Take off",
      desc: leg.flightNo ? `Flight ${leg.flightNo}` : "Flight",
      done: takeOffDone,
      active: takeOffDone && !landingDone,
      location: leg.from,
      status_code: depMerged?.status_code,
      flight: depMerged?.flight,
      pieces: xlPieces ?? depMerged?.pieces ?? undefined,
      weight: xlWeight ?? depMerged?.weight ?? undefined,
      date: depMerged?.date ?? leg.atd ?? leg.etd ?? undefined,
      estimated_date: depMerged?.estimated_date ?? undefined,
      departure_date: depMerged?.departure_date ?? undefined,
      arrival_date: depMerged?.arrival_date ?? undefined,
      excelEtd: xlEtd,
    });

    steps.push({ kind: "arrow", done: landingDone });

    const arrMerged = arrEv ? mergeEventOverrides(arrEv, { location: leg.to, pieces: xlPieces || arrEv.pieces }) : undefined;

    steps.push({
      kind: "node",
      code: "ARR",
      label: "Landing",
      desc: `Arrived at ${leg.to}`,
      done: landingDone,
      active: landingDone && !presentCodes.has("DLV") && !presentCodes.has("AWD") && !(i < flowLegs.length - 1),
      location: leg.to,
      status_code: arrMerged?.status_code,
      flight: arrMerged?.flight,
      pieces: xlPieces ?? arrMerged?.pieces ?? undefined,
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
      const nextLegTakeOff =
        i < flowLegs.length - 1 &&
        (flowLegs[i + 1]?.events.some(e => e.status_code === "DEP" && !!e.date) ?? false);
      const transitDone = transitCodes.some(c => tCodes.has(c)) || landingDone;
      const transitEv = transitEvs.find(e => transitCodes.includes(e.status_code ?? ""));

      steps.push({ kind: "arrow", done: transitDone });

      steps.push({
        kind: "node",
        code: "RCF",
        label: "Ground service",
        desc: `Transit: ${leg.to}`,
        done: transitDone,
        active: transitDone && !nextLegTakeOff,
        location: leg.to,
        date: transitEv?.date,
        status_code: transitEv?.status_code,
        flight: transitEv?.flight,
        pieces: transitEv?.pieces ?? undefined,
      });
    }
  }

  const destDone = ["DLV", "AWD"].some(c => presentCodes.has(c));
  const destEv =
    events.find(e => ["DLV"].includes(e.status_code ?? "")) ?? events.find(e => ["AWD"].includes(e.status_code ?? ""));

  if (flowLegs.length > 0) {
    steps.push({ kind: "arrow", done: destDone });

    steps.push({
      kind: "node",
      code: "DLV",
      label: "Ground service",
      desc: "Final Delivery",
      done: destDone,
      active: destDone,
      location: destDisp,
      date: destEv?.date,
      status_code: destEv?.status_code,
      flight: destEv?.flight,
      pieces: destEv?.pieces,
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

  const flows = rawFlows.filter(flow => {
    const isUnloaded = flow.some(
      ln => ln.events && ln.events.length > 0 && ln.events.every(e => Number(e.pieces) === 0),
    );
    if (isUnloaded) return false;
    if (shipmentHasTransit) {
      const flowHasTransit = flow.some(ln =>
        ln.events.some(e => ["DEP", "ARR", "MAN", "RCF"].includes(e.status_code || "")),
      );
      if (!flowHasTransit) return false;
    }
    return true;
  });

  const failedFlows = rawFlows.filter(f => !flows.includes(f));

  const isDlv = events.some(e => e.status_code === "DLV") || payload.status === "Delivered";
  const isErr = payload.status === "Partial/Ground Error" || payload.status === "Error";
  const overallStatus = isDlv
    ? "Delivered"
    : events.find(e => e.status_code === "DEP")?.status ?? payload.status ?? "In progress";

  const maxPcs = Math.max(
    0,
    ...events.map(e => {
      const s = String(e.pieces ?? "").replace(/[^0-9]/g, "");
      return s ? parseInt(s, 10) : 0;
    }),
  );

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

  const flows_steps = flows.map(fl => buildStepsForFlow(fl, events, originDisp, destDisp, excelLegs));

  const interpretation_trace = [
    ...trace,
    `events:${events.length}`,
    ...(airlineEvents.length > 0 ? ["prefer:airline_leg_builder"] : ["prefer:full_event_leg_builder"]),
    `flows_kept:${flows.length}`,
    `flows_failed:${failedFlows.length}`,
    ...(flows.length !== rawFlows.length ? ["pruned:unload_or_no_transit"] : []),
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
