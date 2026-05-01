/**
 * TAP Cargo (IATA prefix 047) publishes authoritative multi-leg schedules under Awb.Routing.line.
 * Tracker "Segments" can include stale alternates (e.g. TP4002F) and booking event timestamps —
 * merge Routing into BKD/DEP-shaped events so milestones match https://www.tapcargo.com/ e-tracking.
 */

export interface TapRoutingLine {
  FlightOrigin?: string;
  FlightDest?: string;
  FlightNum?: string;
  FlightDate?: string;
  DepartureDate?: string;
  DepartureTime?: string;
  ArrivalDate?: string;
  ArrivalTime?: string;
}

const MON: Record<string, string> = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

/** Parse TAP API date tokens like "30APR26"; optional HH:MM (stored as UTC; date-only → 12:00Z anchor). */
export function parseTapDdMonYy(dateStr: string | undefined, timeHHMM?: string): string | null {
  const s = (dateStr || "").trim().toUpperCase();
  const m = s.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  if (!m) return null;
  const dd = m[1].padStart(2, "0");
  const mon = MON[m[2]];
  if (!mon) return null;
  const year = 2000 + parseInt(m[3], 10);
  let hh = "12";
  let mi = "00";
  const tt = (timeHHMM || "").trim();
  if (/^\d{1,2}:\d{2}$/.test(tt)) {
    const [h, mins] = tt.split(":");
    hh = h.padStart(2, "0");
    mi = mins.padStart(2, "0");
  }
  const d = new Date(`${year}-${mon}-${dd}T${hh}:${mi}:00.000Z`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function routingDepartureIso(ln: TapRoutingLine): string | null {
  const dep = ln.DepartureDate?.trim();
  if (dep) return parseTapDdMonYy(dep, ln.DepartureTime?.trim());
  const fd = ln.FlightDate?.trim();
  if (fd) return parseTapDdMonYy(fd, undefined);
  return null;
}

function routingArrivalIso(ln: TapRoutingLine): string | null {
  const arr = ln.ArrivalDate?.trim();
  if (arr) return parseTapDdMonYy(arr, ln.ArrivalTime?.trim());
  return null;
}

export function normalizeTapFlightNum(f?: string | null): string {
  return (f || "").replace(/\s+/g, "").toUpperCase();
}

function normalizeRoutingPayload(line: Record<string, unknown>): TapRoutingLine {
  const g = (k: string) => String(line[k] ?? "");
  return {
    FlightOrigin: g("FlightOrigin"),
    FlightDest: g("FlightDest"),
    FlightNum: g("FlightNum"),
    FlightDate: g("FlightDate"),
    DepartureDate: g("DepartureDate"),
    DepartureTime: g("DepartureTime"),
    ArrivalDate: g("ArrivalDate"),
    ArrivalTime: g("ArrivalTime"),
  };
}

/** POST TAP public e-tracking JSON API; returns Routing.line rows or null. */
export async function fetchTapCargoRouting(mawbDigits: string): Promise<TapRoutingLine[] | null> {
  const clean = mawbDigits.replace(/-/g, "");
  if (!clean.startsWith("047") || clean.length !== 11) return null;

  const url =
    "https://www.tapcargo.com/api/cargo/cargo-flight-list?functionName=retrieveCargoETracking";
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 9000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (compatible; CargoGentTapSchedule/1.0; +https://cargogent.com)",
      },
      body: JSON.stringify({ AirwayBillNumber: clean }),
      signal: ac.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    const awb = json.Awb as Record<string, unknown> | undefined;
    const routing = awb?.Routing as Record<string, unknown> | undefined;
    const rawLine = routing?.line;
    const arr = Array.isArray(rawLine) ? rawLine : rawLine ? [rawLine] : [];
    const lines = (arr as Record<string, unknown>[]).map(normalizeRoutingPayload).filter(l => l.FlightNum && l.FlightOrigin && l.FlightDest);
    return lines.length > 0 ? lines : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Drops BKD noise rows that TAP no longer exposes on the authoritative Routing itinerary
 * (e.g. alternate TP4002F when Routing lists TP4000F for CDG→LIS).
 */
type RoutableEvt = {
  flight?: string;
  status_code?: string;
};

export function pruneSupersededTapBkds<T extends RoutableEvt>(events: T[], lines: TapRoutingLine[]): T[] {
  const canon = new Set(lines.map(l => normalizeTapFlightNum(l.FlightNum)));
  return events.filter(e => {
    const code = e.status_code || "";
    if (code !== "BKD" || !e.flight) return true;
    const fl = normalizeTapFlightNum(e.flight);
    if (!fl) return true;
    if (canon.has(fl)) return true;
    // Known TAP alternate that appears in Segments but not Routing for this itinerary
    if (fl === "TP4002F" && canon.has("TP4000F")) return false;
    return true;
  });
}

/** Copies scheduled departure/arrival ISO strings from Routing onto matching flight rows. */
export function augmentEventsWithTapRouting(
  events: { flight?: string; departure_date?: string; arrival_date?: string }[],
  lines: TapRoutingLine[],
): void {
  for (const e of events) {
    if (!e.flight) continue;
    const nf = normalizeTapFlightNum(e.flight);
    const ln = lines.find(l => normalizeTapFlightNum(l.FlightNum) === nf);
    if (!ln) continue;

    const depIso = routingDepartureIso(ln);
    const arrIso = routingArrivalIso(ln);
    if (depIso) e.departure_date = depIso;
    if (arrIso) e.arrival_date = arrIso;
  }
}

export function applyTapRoutingToPayload(
  events: { flight?: string; status_code?: string; departure_date?: string; arrival_date?: string }[],
  rawMeta?: Record<string, unknown> | null,
): void {
  const lines = rawMeta?.tap_routing as TapRoutingLine[] | undefined;
  if (!lines?.length || !events.length) return;

  const pruned = pruneSupersededTapBkds(events, lines);
  events.splice(0, events.length, ...pruned);
  augmentEventsWithTapRouting(events, lines);
}

/**
 * Fetches TAP Routing (047…) when missing from raw_meta and applies prune+schedule onto payload.events.
 * Safe to call for live GET, stored payloads, or before save persistence.
 */
export async function merge047TapIntoTrackingPayload(payload: Record<string, unknown>): Promise<void> {
  const mawb = String(payload.awb ?? "")
    .replace(/-/g, "")
    .trim();
  if (!mawb.startsWith("047") || mawb.length !== 11 || process.env.SKIP_TAP_SCHEDULE === "1") return;

  const ev = payload.events;
  if (!Array.isArray(ev) || ev.length === 0) return;

  const rm = { ...((payload.raw_meta as Record<string, unknown>) || {}) };
  payload.raw_meta = rm;

  if (!Array.isArray(rm.tap_routing) || rm.tap_routing.length === 0) {
    const lines = await fetchTapCargoRouting(mawb);
    if (lines?.length) rm.tap_routing = lines;
  }

  applyTapRoutingToPayload(ev as { flight?: string; status_code?: string; departure_date?: string; arrival_date?: string }[], rm);
}
