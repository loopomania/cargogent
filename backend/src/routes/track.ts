import { Router } from "express";
import { trackByAirline, trackByAwb } from "../services/trackService.js";
import { authOptional, requireAuthenticated } from "../middleware/auth.js";
import { logQueryRequest } from "../services/db.js";

const router = Router();

function safeDateStr(val: any): string | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * True when the upstream AWB tracker indicates the airline scrape failed.
 * Trackers may still return HTTP 200 with ground-only events and a nominal status
 * (e.g. "Ready for flight") while raw_meta.trace records driver_error.
 */
function hasAirlineTrackerFailure(data: any): boolean {
  if (!data || typeof data !== "object") return false;
  if (data.status === "Error") return true;
  const st = typeof data.status === "string" ? data.status.toLowerCase() : "";
  if (st.includes("circuit breaker")) return true;
  const msg = typeof data.message === "string" ? data.message.toLowerCase() : "";
  if (msg.includes("driver error")) return true;
  const trace = data.raw_meta?.trace;
  if (Array.isArray(trace) && trace.some((t: unknown) => String(t).includes("driver_error"))) {
    return true;
  }
  return false;
}

import { getPool } from "../services/db.js";
import { normalizeEventDate } from "../services/eventDateNormalize.js";
import {
  computeMilestoneProjection,
  enrichTrackingPayloadWithMilestone,
  isReturnToOriginDelivery,
  milestoneExcelPiecesHint,
} from "../services/milestoneEngine.js";
import { merge047TapIntoTrackingPayload } from "../services/tapCargoRouting.js";
import { hawbQueryParamForLiveTrack } from "../services/hawbLiveQuery.js";

function milestoneEnrichmentEnabled(): boolean {
  return process.env.SKIP_ENRICH_MILESTONE !== "1";
}

/** Min positive pieces_pcs across matched Excel legs — stable HAWB declaration vs leg-count SUM noise. */
function excelHousePiecesHintFromRows(rows: Array<{ pieces_pcs?: unknown }>): number | null {
  const nums = rows
    .map((r) => {
      const v = r.pieces_pcs;
      if (v == null || v === "") return 0;
      const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.]/g, ""));
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    })
    .filter((n) => n > 0);
  if (nums.length === 0) return null;
  return Math.min(...nums);
}

/** IATA-style port for hint matching (ILTLV → TLV, "TLV (MAMAN)" → TLV). */
function normalizePortForHints(port: string | null | undefined): string {
  const s = String(port ?? "").trim().toUpperCase();
  if (!s) return "";
  if (s.length === 5 && /^[A-Z]{2}[A-Z]{3}$/.test(s)) return s.slice(-3);
  const m = s.match(/\b([A-Z]{3})\b/);
  if (m) return m[1];
  return s.length >= 3 ? s.slice(-3) : s;
}

function firstIntFromPiecesField(val: unknown): number {
  if (val == null || val === "") return 0;
  if (typeof val === "number" && Number.isFinite(val)) return Math.max(0, Math.floor(val));
  const m = String(val).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

const ORIGIN_GROUND_ACCEPTANCE_CODES = new Set(["RCS", "BKD", "FOH", "DIS", "130"]);

/**
 * When Excel transport rows exist for this HAWB but `pieces_pcs` was never populated, use ground-handler
 * acceptance at the shipment origin as the house declaration (Maman TLV RCS showing 1 vs Thai DEP MAWB rollup).
 */
function inferHawbPiecesHintFromOriginGround(events: unknown[] | undefined, originAirport: unknown): number | null {
  const want = normalizePortForHints(String(originAirport ?? ""));
  if (!want || !Array.isArray(events) || events.length === 0) return null;
  const found: number[] = [];
  for (const raw of events) {
    const ev = raw as Record<string, unknown>;
    if (!ev || typeof ev !== "object") continue;
    const src = String(ev.source ?? "").toLowerCase();
    const loc = String(ev.location ?? "");
    const u = loc.toUpperCase();
    const isGround = src === "maman" || src === "swissport" || u.includes("MAMAN") || u.includes("SWISSPORT");
    if (!isGround) continue;
    if (normalizePortForHints(loc) !== want) continue;
    const code = String(ev.status_code ?? "");
    if (!ORIGIN_GROUND_ACCEPTANCE_CODES.has(code)) continue;
    const n = firstIntFromPiecesField(ev.actual_pieces ?? ev.pieces);
    if (n > 0 && n < 500) found.push(n);
  }
  if (found.length === 0) return null;
  return Math.min(...found);
}

/** Merge excel pieces hint toward the minimum (CargoGent house truth). */
function mergeExcelPiecesHints(prevRaw: unknown, next: number): number {
  if (next <= 0) return next;
  const prevNum =
    typeof prevRaw === "number" ? prevRaw : prevRaw != null && prevRaw !== "" ? parseFloat(String(prevRaw)) : NaN;
  if (Number.isFinite(prevNum) && prevNum > 0) return Math.min(Math.floor(prevNum), next);
  return next;
}

/**
 * When Excel has no `pieces_pcs` but this is a HAWB-scoped Excel shipment, infer house pieces from
 * Maman/Swissport acceptance at origin. Live tracker payloads often omit ground rows that were
 * persisted separately — fall back to `query_events` for those sources.
 */
async function applyHawbPiecesHintInferWithDbFallback(
  p: import("pg").Pool,
  tenantId: string | undefined,
  mawbClean: string,
  hawbTrimmed: string,
  data: any,
): Promise<void> {
  const hawbNorm = hawbTrimmed.trim();
  if (!data?.origin || hawbNorm === "" || hawbNorm === mawbClean) return;
  const tryInfer = (evs: unknown[]) => inferHawbPiecesHintFromOriginGround(evs, data.origin);
  const evs = Array.isArray(data.events) ? data.events : [];
  let inf = evs.length > 0 ? tryInfer(evs) : null;
  if (inf != null && inf > 0) {
    data.raw_meta = data.raw_meta || {};
    data.raw_meta.excel_pieces_hint = mergeExcelPiecesHints(data.raw_meta.excel_pieces_hint, inf);
    data.raw_meta.excel_pieces_hint_from_hawb_line = true;
    return;
  }
  if (!tenantId) return;
  try {
    const r = await p.query(
      `SELECT payload FROM query_events WHERE tenant_id = $1 AND mawb = $2 AND hawb = $3 AND source IN ('maman', 'swissport') ORDER BY occurred_at ASC NULLS LAST`,
      [tenantId, mawbClean, hawbNorm],
    );
    const extra = r.rows.map((row: { payload?: unknown }) =>
      typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
    );
    inf = tryInfer([...evs, ...extra]);
    if (inf != null && inf > 0) {
      data.raw_meta = data.raw_meta || {};
      data.raw_meta.excel_pieces_hint = mergeExcelPiecesHints(data.raw_meta.excel_pieces_hint, inf);
      data.raw_meta.excel_pieces_hint_from_hawb_line = true;
    }
  } catch {
    /* non-fatal */
  }
}

/** MIN(pieces_pcs) on the HAWB row(s) without shipment_id hop — survives CTE / ingest quirks. */
async function mergeDirectExcelPiecesHintForHawb(
  p: import("pg").Pool,
  tenantId: string | undefined,
  mawbClean: string,
  hawbTrimmed: string,
  data: any,
): Promise<void> {
  const isGlobalAdmin = !tenantId || tenantId === "00000000-0000-0000-0000-000000000000";
  try {
    const q = isGlobalAdmin
      ? `SELECT MIN(pieces_pcs) AS m FROM excel_transport_lines WHERE master_awb = $1 AND TRIM(COALESCE(house_ref, '')) = $2 AND COALESCE(pieces_pcs::numeric, 0) > 0`
      : `SELECT MIN(pieces_pcs) AS m FROM excel_transport_lines WHERE tenant_id = $1::uuid AND master_awb = $2 AND TRIM(COALESCE(house_ref, '')) = $3 AND COALESCE(pieces_pcs::numeric, 0) > 0`;
    const args = isGlobalAdmin ? [mawbClean, hawbTrimmed] : [tenantId, mawbClean, hawbTrimmed];
    const r = await p.query<{ m?: unknown }>(q, args);
    const raw = r.rows[0]?.m;
    if (raw == null || raw === "") return;
    const n = typeof raw === "number" ? raw : parseFloat(String(raw));
    if (!Number.isFinite(n) || n <= 0) return;
    const dir = Math.floor(n);
    data.raw_meta = data.raw_meta || {};
    const prev = data.raw_meta.excel_pieces_hint;
    const prevNum =
      typeof prev === "number" ? prev : prev != null && prev !== "" ? parseFloat(String(prev)) : NaN;
    data.raw_meta.excel_pieces_hint =
      Number.isFinite(prevNum) && prevNum > 0 ? Math.min(prevNum, dir) : dir;
    data.raw_meta.excel_pieces_hint_from_hawb_line = true;
  } catch {
    /* non-fatal */
  }
}

/** When live airline scrape fails, merge last persisted airline events (parity with saveTrackingResult). */
async function mergePersistedAirlineEventsWhenLiveTrackerFailed(
  data: any,
  tenantId: string | undefined,
  mawbClean: string,
  hawbQ: string | undefined,
): Promise<void> {
  if (!tenantId) return;
  if (!hasAirlineTrackerFailure(data)) return;
  if (data.raw_meta?.ground_only) return;
  const hawbKey = hawbQ && hawbQ.trim() !== "" ? hawbQ.trim() : mawbClean;
  const p = getPool();
  if (!p) return;
  try {
    const existingAirlineEvents = await p.query(
      `SELECT payload FROM query_events WHERE tenant_id = $1 AND mawb = $2 AND hawb = $3 AND source = 'airline'`,
      [tenantId, mawbClean, hawbKey],
    );
    const airlineEvs = existingAirlineEvents.rows.map((r: any) =>
      typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload,
    );
    if (airlineEvs.length === 0) return;
    data.events = [...(data.events || []), ...airlineEvs];
    const lastAir = airlineEvs[airlineEvs.length - 1];
    if (data.status === "Error" && lastAir?.status) {
      data.status = lastAir.status;
    }
    const uniqueEventsMap = new Map<string, any>();
    for (const ev of data.events) {
      ev.date = normalizeEventDate(ev.date) || ev.date;
      if (ev.departure_date) ev.departure_date = normalizeEventDate(ev.departure_date) || ev.departure_date;
      if (ev.arrival_date) ev.arrival_date = normalizeEventDate(ev.arrival_date) || ev.arrival_date;
      const code = ev.status_code || "UNKN";
      const loc = (ev.location || "").trim().toUpperCase();
      const dt = ev.date || "";
      const pcs = ev.pieces || ev.actual_pieces || "0";
      const key = `${code}|${loc}|${dt}|${pcs}`;
      if (!uniqueEventsMap.has(key)) uniqueEventsMap.set(key, ev);
    }
    data.events = Array.from(uniqueEventsMap.values()).sort(
      (a: any, b: any) =>
        new Date((a.date as string) || 0).getTime() - new Date((b.date as string) || 0).getTime(),
    );
  } catch (e) {
    console.warn("[track] merge persisted airline events skipped:", e);
  }
}

async function getActualTenantId(user: any, awb: string, hawb?: string): Promise<string | undefined> {
  if (user?.tenant_id) return user.tenant_id;
  const p = getPool();
  if (!p) return undefined;
  try {
    const res = await p.query(
      "SELECT tenant_id FROM leg_status_summary WHERE shipment_id = $1 LIMIT 1",
      [hawb || awb.replace(/-/g, "")]
    );
    return res.rows[0]?.tenant_id;
  } catch (err) {
    return undefined;
  }
}

/** Persist a live enrichment back to queue/summary/events when this tenant already owns the shipment (updates cache on "Sync Now"). */
async function persistLiveEnrichedTracking(
  user: { tenant_id?: string; email?: string; role?: string; sub?: string } | undefined,
  mawbClean: string,
  hawbFromQuery: string | undefined,
  data: any,
): Promise<void> {
  if (!user?.sub) return;
  const p = getPool();
  if (!p) return;
  try {
    const shipmentId = hawbFromQuery || mawbClean;
    let tenantId: string | undefined = user.tenant_id;
    const globalTenant =
      !tenantId || tenantId === "00000000-0000-0000-0000-000000000000";
    if (user.role === "admin" || globalTenant) {
      const r = await p.query<{ tenant_id: string }>(
        `SELECT tenant_id FROM leg_status_summary WHERE shipment_id = $1 LIMIT 1`,
        [shipmentId],
      );
      tenantId = r.rows[0]?.tenant_id;
    }
    if (!tenantId || tenantId === "00000000-0000-0000-0000-000000000000") return;

    const own = await p.query(
      `SELECT 1 FROM leg_status_summary WHERE tenant_id = $1 AND shipment_id = $2 LIMIT 1`,
      [tenantId, shipmentId],
    );
    if (own.rows.length === 0) return;
    await saveTrackingResult(tenantId, mawbClean, hawbFromQuery, data, (user as { email?: string }).email);
  } catch (e) {
    console.warn("[track] persist enriched snapshot skipped:", e);
  }
}

/** Helper to append excel dates to the tracking payload before returning to client */
export async function appendExcelDatesToTrackingData(tenantId: string | undefined, mawb: string, hawb: string | undefined, data: any) {
  const p = getPool();
  if (!p) return data;
  
  try {
    const mawbClean = mawb.replace(/-/g, "");
    const isHawbSpecific = hawbQueryParamForLiveTrack(mawb, hawb) !== undefined;
    
    const isGlobalAdmin = !tenantId || tenantId === '00000000-0000-0000-0000-000000000000';
    
    // Find the shipment_id first, then fetch its legs.
    const byMawbHawb = isGlobalAdmin ? `
       WITH target_shipment AS (
          SELECT shipment_id 
          FROM excel_transport_lines 
          WHERE master_awb = $1 AND house_ref = $2
          LIMIT 1
       )
       SELECT leg_sequence, leg_load_port, leg_discharge_port, leg_etd, leg_eta, first_leg_etd, israel_landing_eta, pieces_pcs
       FROM excel_transport_lines 
       WHERE shipment_id = (SELECT shipment_id FROM target_shipment)
       ORDER BY leg_sequence ASC
    ` : `
       WITH target_shipment AS (
          SELECT shipment_id 
          FROM excel_transport_lines 
          WHERE tenant_id = $1 AND master_awb = $2 AND house_ref = $3
          LIMIT 1
       )
       SELECT leg_sequence, leg_load_port, leg_discharge_port, leg_etd, leg_eta, first_leg_etd, israel_landing_eta, pieces_pcs
       FROM excel_transport_lines 
       WHERE tenant_id = $1 AND shipment_id = (SELECT shipment_id FROM target_shipment)
       ORDER BY leg_sequence ASC
    `;
    
    const byMawbOnly = isGlobalAdmin ? `
       WITH target_shipment AS (
          SELECT e.shipment_id
          FROM excel_transport_lines e
          INNER JOIN excel_import_batches b ON b.id = e.batch_id
          WHERE e.master_awb = $1
          ORDER BY b.ingested_at DESC NULLS LAST, e.id DESC
          LIMIT 1
       )
       SELECT leg_sequence, leg_load_port, leg_discharge_port, leg_etd, leg_eta, first_leg_etd, israel_landing_eta, pieces_pcs
       FROM excel_transport_lines 
       WHERE shipment_id = (SELECT shipment_id FROM target_shipment)
       ORDER BY leg_sequence ASC
    ` : `
       WITH target_shipment AS (
          SELECT shipment_id 
          FROM excel_transport_lines 
          WHERE tenant_id = $1 AND master_awb = $2
          ORDER BY id DESC
          LIMIT 1
       )
       SELECT leg_sequence, leg_load_port, leg_discharge_port, leg_etd, leg_eta, first_leg_etd, israel_landing_eta, pieces_pcs
       FROM excel_transport_lines 
       WHERE tenant_id = $1 AND shipment_id = (SELECT shipment_id FROM target_shipment)
       ORDER BY leg_sequence ASC
    `;
    
    let resExcel = { rows: [] as any[] };
    let hawbMatchedExcel = false;

    if (isHawbSpecific) {
      const args = isGlobalAdmin ? [mawbClean, hawb] : [tenantId, mawbClean, hawb];
      resExcel = await p.query(byMawbHawb, args);
      hawbMatchedExcel = resExcel.rows.length > 0;
    }

    if (resExcel.rows.length === 0 && !isHawbSpecific) {
      const args = isGlobalAdmin ? [mawbClean] : [tenantId, mawbClean];
      resExcel = await p.query(byMawbOnly, args);
      hawbMatchedExcel = false;
    }

    if (resExcel.rows.length > 0) {
      data.raw_meta = data.raw_meta || {};
      data.raw_meta.excel_etd = resExcel.rows[0].first_leg_etd || resExcel.rows[0].leg_etd || null;
      data.raw_meta.excel_eta = resExcel.rows[resExcel.rows.length - 1].israel_landing_eta || resExcel.rows[resExcel.rows.length - 1].leg_eta || null;
      data.raw_meta.excel_legs = resExcel.rows.map((r, i) => ({
        seq: r.leg_sequence,
        from: r.leg_load_port,
        to: r.leg_discharge_port,
        etd: r.leg_etd || (i === 0 ? r.first_leg_etd : null),
        eta: r.leg_eta || (i === resExcel.rows.length - 1 ? r.israel_landing_eta : null)
      }));

      if (hawbMatchedExcel) {
        const hp = excelHousePiecesHintFromRows(resExcel.rows);
        if (hp != null) {
          data.raw_meta.excel_pieces_hint = hp;
          data.raw_meta.excel_pieces_hint_from_hawb_line = true;
        }
      }
      
      // Fallback for origin/destination if tracker didn't provide them
      if (!data.origin) {
        const rawFrom = resExcel.rows[0].leg_load_port;
        data.origin = rawFrom ? (rawFrom.length === 5 ? rawFrom.slice(-3) : rawFrom) : null;
      }
      if (!data.destination) {
        const rawTo = resExcel.rows[resExcel.rows.length - 1].leg_discharge_port;
        data.destination = rawTo ? (rawTo.length === 5 ? rawTo.slice(-3) : rawTo) : null;
      }
    }

    if (isHawbSpecific && hawb) {
      await mergeDirectExcelPiecesHintForHawb(p, tenantId, mawbClean, hawb.trim(), data);
    }

    if (isHawbSpecific && hawb && hawbMatchedExcel && resExcel.rows.length > 0) {
      const rowHp = excelHousePiecesHintFromRows(resExcel.rows);
      if (rowHp == null) {
        await applyHawbPiecesHintInferWithDbFallback(p, tenantId, mawbClean, hawb.trim(), data);
      }
    }
  } catch (err) {
    console.error("Failed to append excel dates", err);
  }
  return data;
}
export { normalizeEventDate } from "../services/eventDateNormalize.js";

/** Shared helper: persist a tracking result into query_schedule (+ leg_status_summary + query_events). Skips queue upserts when shipment is already Archived so it stays in the archive UI. */
export async function saveTrackingResult(
  tenantId: string,
  awb: string,
  hawb: string | undefined,
  data: any,
  username?: string
) {
  if (!tenantId) return;
  const p = getPool();
  if (!p) return;

  // Enrich with Excel booking data (Planned legs/dates) before persisting
  await appendExcelDatesToTrackingData(tenantId, awb, hawb, data);

  const mawb = awb.replace(/-/g, "");
  const hawbKey = hawb || mawb;

  const persistedLeg1 = await p.query<{ aggregated_status?: string | null; last_event_list_hash?: string | null }>(
    `SELECT aggregated_status, last_event_list_hash FROM leg_status_summary WHERE tenant_id = $1 AND shipment_id = $2 AND leg_sequence = 1`,
    [tenantId, hawbKey],
  );
  const prevPersistedAgg = persistedLeg1.rows[0]?.aggregated_status ?? undefined;
  const prevPersistedHash = persistedLeg1.rows[0]?.last_event_list_hash ?? undefined;
  const wasArchivedShipment =
    persistedLeg1.rows.length > 0 &&
    String(prevPersistedAgg ?? "").trim().toLowerCase().startsWith("archived");

  const domainName = username ? username.split('@')[1] : null;

  let events = data.events || [];
  
  // If Python returned ground_only, or if the primary airline tracker failed (Error / circuit breaker /
  // Playwright driver_error with ground snapshot), we MUST restore existing airline events from DB
  // to prevent a destructive wipe.
  const hasAirlineError = hasAirlineTrackerFailure(data);
  
  if (data.raw_meta?.ground_only || hasAirlineError) {
    const existingAirlineEvents = await p.query(
      `SELECT payload FROM query_events WHERE tenant_id = $1 AND mawb = $2 AND hawb = $3 AND source = 'airline'`,
      [tenantId, mawb, hawbKey]
    );
    const airlineEvs = existingAirlineEvents.rows.map(r => typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload);
    events = [...events, ...airlineEvs];
    
    // If we restored airline events, ensure the status doesn't revert to "Error"
    if (hasAirlineError && airlineEvs.length > 0) {
      data.status = airlineEvs[airlineEvs.length - 1].status || data.status;
    }
  }

  data.events = events;
  try {
    await merge047TapIntoTrackingPayload(data);
  } catch (e: any) {
    console.warn("[saveTrackingResult] TAP merge skipped:", e?.message ?? e);
  }
  events = data.events || [];

  // NORMALIZATION & DEDUPLICATION
  const uniqueEventsMap = new Map<string, any>();
  for (const ev of events) {
    ev.date = normalizeEventDate(ev.date) || ev.date;
    if (ev.departure_date) ev.departure_date = normalizeEventDate(ev.departure_date) || ev.departure_date;
    if (ev.arrival_date) ev.arrival_date = normalizeEventDate(ev.arrival_date) || ev.arrival_date;

    const code = ev.status_code || "UNKN";
    const loc = (ev.location || "").trim().toUpperCase();
    const dt = ev.date || "";
    const pcs = ev.pieces || ev.actual_pieces || "0";
    const key = `${code}|${loc}|${dt}|${pcs}`;
    
    // Prefer the first encountered if collision
    if (!uniqueEventsMap.has(key)) {
      uniqueEventsMap.set(key, ev);
    }
  }
  events = Array.from(uniqueEventsMap.values());

  const sorted = [...events].sort(
    (a: any, b: any) =>
      new Date((a.date as string) || 0).getTime() -
      new Date((b.date as string) || 0).getTime()
  );

  const latestEvent = sorted[sorted.length - 1];
  let derivedStatus = latestEvent?.status ?? latestEvent?.status_code ?? data.status ?? "No Status";

  const dlvEvents = events.filter((e: any) => e.status_code === "DLV");
  let isFullyDelivered = false;
  let groundOnly = false;

  if (dlvEvents.length > 0) {
    const extractPcs = (val: any) => {
      if (!val) return 0;
      const s = String(val).replace(/[^0-9]/g, "");
      return s ? parseInt(s, 10) : 0;
    };

    let expectedTotal = extractPcs(data.raw_meta?.pieces);
    const maxEventPieces = Math.max(0, ...events.map((e: any) => extractPcs(e.pieces)));
    if (maxEventPieces > expectedTotal) expectedTotal = maxEventPieces;

    const dbExpected = await p.query(
      `SELECT SUM(pieces_pcs) as total 
       FROM excel_transport_lines 
       WHERE tenant_id = $1 AND master_awb = $2 AND COALESCE(house_ref, '') = COALESCE($3, '')`,
      [tenantId, mawb, hawb === mawb ? '' : (hawb || '')]
    );
    
    if (dbExpected.rows[0]?.total) {
      const dbTotal = parseInt(dbExpected.rows[0].total, 10);
      if (dbTotal > 0) expectedTotal = dbTotal;
    }

    let airlineDeliveredTotal = 0;
    let groundDeliveredTotal = 0;
    let airlineDlvCount = 0;
    let groundDlvCount = 0;
    let airlineDlvWithoutPiecesAtDestination = false;
    for (const e of dlvEvents) {
      const pcs = extractPcs(e.actual_pieces || e.pieces);
      if (e.source === "maman" || e.source === "swissport" || e.source === "ground") {
        groundDeliveredTotal += pcs;
        groundDlvCount++;
      } else {
        airlineDeliveredTotal += pcs;
        airlineDlvCount++;
        const evLoc = String(e.location || "").toUpperCase();
        const destLoc = String(data.destination || "").toUpperCase();
        if (pcs === 0 && destLoc && evLoc.includes(destLoc)) {
          airlineDlvWithoutPiecesAtDestination = true;
        }
      }
    }

    const isImport = data.destination === "TLV" || data.destination === "TEL AVIV";
    const isExport = data.origin === "TLV" || data.origin === "TEL AVIV";

    if (isImport) {
      if ((expectedTotal > 0 && groundDeliveredTotal >= expectedTotal) || (expectedTotal === 0 && groundDlvCount > 0)) {
        isFullyDelivered = true;
        derivedStatus = "Delivered";
      } else if ((expectedTotal > 0 && airlineDeliveredTotal >= expectedTotal) || (expectedTotal === 0 && airlineDlvCount > 0)) {
        groundOnly = true;
        derivedStatus = "Partial Delivery"; 
      } else {
        derivedStatus = "Partial Delivery";
      }
    } else if (isExport) {
      if (
        (expectedTotal > 0 && airlineDeliveredTotal >= expectedTotal) ||
        (expectedTotal === 0 && airlineDlvCount > 0) ||
        airlineDlvWithoutPiecesAtDestination
      ) {
        isFullyDelivered = true;
        derivedStatus = "Delivered";
      } else {
        derivedStatus = "Partial Delivery";
      }
    } else {
      // Default fallback if not TLV
      const bestDelivered = Math.max(airlineDeliveredTotal, groundDeliveredTotal);
      if (
        (expectedTotal > 0 && bestDelivered >= expectedTotal) ||
        (expectedTotal === 0 && dlvEvents.length > 0) ||
        airlineDlvWithoutPiecesAtDestination
      ) {
        isFullyDelivered = true;
        derivedStatus = "Delivered";
      } else {
        derivedStatus = "Partial Delivery";
      }
    }
  }

  /** Pick latest ATA/ETA snapshots — chronological `find()` kept first hub arrivals on long exports. */
  let ataEventObj: any;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const e = sorted[i];
    const c = e?.status_code;
    if (c === "ARR" || c === "RCF" || c === "DLV") {
      ataEventObj = e;
      break;
    }
  }
  const ataEvent = ataEventObj?.date;
  let etaEvent: string | undefined = data.eta;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const e = sorted[i];
    const c = e?.status_code;
    if ((c === "ARR" || c === "RCF") && e?.estimated_date) {
      etaEvent = e.estimated_date as string;
      break;
    }
  }

  const isAirborne = derivedStatus === "Departed" || derivedStatus === "DEP";
  const groundHours = Math.floor(Math.random() * (9 - 6 + 1)) + 6; // 6 to 9
  const airHours = Math.floor(Math.random() * (15 - 10 + 1)) + 10; // 10 to 15
  let intervalStr = isAirborne ? `${airHours} hours` : `${groundHours} hours`;

  const isExportGlobal = data.origin === "TLV" || data.origin === "TEL AVIV" || (!!data.raw_meta?.ground_query_method && hawbKey.startsWith("ISR"));
  if (isExportGlobal && ataEventObj && ataEvent) {
    const destLoc = data.destination;
    const ataLoc = ataEventObj.location;
    let isFinalDest = false;
    
    if (ataLoc && destLoc && ataLoc.toUpperCase().includes(destLoc.toUpperCase())) {
      isFinalDest = true;
    } else if (!destLoc && ataLoc) {
       const excel_legs = data.raw_meta?.excel_legs || [];
       const finalExcelDest = excel_legs.length > 0 ? excel_legs[excel_legs.length - 1].to : null;
       if (finalExcelDest && ataLoc.toUpperCase().includes(finalExcelDest.toUpperCase())) {
         isFinalDest = true;
       }
    }

    if (isFinalDest) {
      const daysSinceAta = (Date.now() - new Date(ataEvent).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceAta >= 3) {
        isFullyDelivered = true;
        data.message = (data.message ? data.message + " | " : "") + "Stopped tracking";
      } else {
        intervalStr = '24 hours';
      }
    }
  }

  // Archived rows intentionally omit query_schedule (see POST /mark-archived). Do not recreate schedule on refresh.
  if (!wasArchivedShipment) {
    if (domainName) {
      await p.query(
        `INSERT INTO query_schedule (tenant_id, mawb, hawb, next_status_check_at, last_check_at, domain_name, ground_only)
         VALUES ($1, $2, $3, NOW() + interval '${intervalStr}', NOW(), $4, $5)
         ON CONFLICT (tenant_id, mawb, hawb) DO UPDATE SET
           next_status_check_at = NOW() + interval '${intervalStr}',
           last_check_at = NOW(),
           error_count_consecutive = 0,
           ground_only = EXCLUDED.ground_only,
           domain_name = COALESCE(query_schedule.domain_name, EXCLUDED.domain_name)`,
        [tenantId, mawb, hawbKey, domainName, groundOnly],
      );
    } else {
      await p.query(
        `INSERT INTO query_schedule (tenant_id, mawb, hawb, next_status_check_at, last_check_at, ground_only)
         VALUES ($1, $2, $3, NOW() + interval '${intervalStr}', NOW(), $4)
         ON CONFLICT (tenant_id, mawb, hawb) DO UPDATE SET
           next_status_check_at = NOW() + interval '${intervalStr}',
           error_count_consecutive = 0,
           ground_only = EXCLUDED.ground_only,
           last_check_at = NOW()`,
        [tenantId, mawb, hawbKey, groundOnly],
      );
    }
  }
  
  // Latest uplift for summary — first `DEP` was always TLV on multi-hop feeders.
  let etdEvent =
    [...sorted].reverse().find(e => e.status_code === "DEP")?.date ??
    [...sorted].reverse().find(e => e.status_code === "BKD")?.departure_date ??
    [...sorted].reverse().find(e => e.status_code === "BKD")?.date ??
    data.etd;

  console.log(`[saveTrackingResult] HAWB: ${hawbKey} | Events: ${events.length} | ETD: ${etdEvent}`);

  // Derive display status from events (matches MilestonePlan logic)

  if (
    derivedStatus === "Delivered" &&
    (data.raw_meta?.return_to_origin === true || isReturnToOriginDelivery(sorted))
  ) {
    derivedStatus = "Delivered to origin";
  }

  const currentHash = events.length + "-" + derivedStatus;
  const statusStoredInSummary = wasArchivedShipment ? "Archived" : derivedStatus;
  if (!wasArchivedShipment && persistedLeg1.rows.length > 0) {
    if (prevPersistedAgg !== derivedStatus || prevPersistedHash !== currentHash) {
      await p.query(
        `INSERT INTO awb_latest_change (tenant_id, mawb, hawb, event_type, payload) VALUES ($1, $2, $3, 'STATUS_CHANGE', $4)`,
        [tenantId, mawb, hawbKey, JSON.stringify({ old_status: prevPersistedAgg, new_status: derivedStatus })],
      );
      await p.query(
        `UPDATE query_schedule SET last_changed_at = NOW(), stale_alert_sent = false WHERE tenant_id = $1 AND mawb = $2 AND hawb = $3`,
        [tenantId, mawb, hawbKey],
      );
    }
  }

  // Discrepancy checks
  const milestone_projection = computeMilestoneProjection({
    events: sorted as any,
    origin: data.origin ?? null,
    destination: data.destination ?? null,
    status: derivedStatus ?? data.status ?? null,
    excelLegs: (data.raw_meta?.excel_legs ?? []) as any,
    excelPiecesHint: milestoneExcelPiecesHint(data.raw_meta),
    trustExcelHawbTransportPieces: data.raw_meta?.excel_pieces_hint_from_hawb_line === true,
    rawMeta: (data.raw_meta ?? null) as Record<string, unknown> | null,
    message: typeof data.message === "string" ? data.message : null,
    hawb: hawbKey,
  });

  const excelLegs = data.raw_meta?.excel_legs;
  if (!wasArchivedShipment && excelLegs && excelLegs.length > 0 && events.length > 0) {
    const lastExcel = excelLegs[excelLegs.length - 1];
    const xlEta = lastExcel?.eta ? new Date(lastExcel.eta).getTime() : 0;
    const trackerEta = etaEvent ? new Date(etaEvent).getTime() : 0;
    const trackerAta = ataEvent ? new Date(ataEvent).getTime() : 0;

    // Check missing Arrival updates (>3 hours past Schedule)
    if (xlEta > 0 && !trackerAta && Date.now() > xlEta + 3 * 3600000) {
      await p.query(
        `INSERT INTO awb_latest_change (tenant_id, mawb, hawb, event_type, payload) VALUES ($1, $2, $3, 'DISCREPANCY', $4)`,
        [tenantId, mawb, hawbKey, JSON.stringify({ type: "MISSING_ARRIVAL", delay_hours: Math.round((Date.now() - xlEta) / 3600000) })],
      );
    }
    // Check EDD > ADD or EDA > ADA logical discrepancy
    if (trackerEta > 0 && trackerAta > 0 && trackerEta > trackerAta + 60000) {
      await p.query(
        `INSERT INTO awb_latest_change (tenant_id, mawb, hawb, event_type, payload) VALUES ($1, $2, $3, 'DISCREPANCY', $4)`,
        [tenantId, mawb, hawbKey, JSON.stringify({ type: "LOGICAL_ERROR_ETA_AHEAD_OF_ATA" })],
      );
    }
  }

// 2. Upsert leg_status_summary with full snapshot ALWAYS (even if 0 events, to cache status)
  if (domainName) {
    await p.query(
      `INSERT INTO leg_status_summary
         (tenant_id, shipment_id, leg_sequence, aggregated_status, last_event_at, summary, updated_at, domain_name, last_event_list_hash)
       VALUES ($1, $2, 1, $3, NOW(), $4, NOW(), $5, $6)
       ON CONFLICT (tenant_id, shipment_id, leg_sequence) DO UPDATE SET
         aggregated_status = EXCLUDED.aggregated_status,
         last_event_at     = EXCLUDED.last_event_at,
         summary           = EXCLUDED.summary,
         updated_at        = EXCLUDED.updated_at,
         last_event_list_hash = EXCLUDED.last_event_list_hash,
         domain_name       = COALESCE(leg_status_summary.domain_name, EXCLUDED.domain_name)`,
      [
        tenantId,
        hawbKey,
        statusStoredInSummary,
        JSON.stringify({
          ata: safeDateStr(ataEvent),
          eta: safeDateStr(etaEvent),
          etd: safeDateStr(etdEvent),
          origin: data.origin ?? null,
          destination: data.destination ?? null,
          airline: data.airline ?? null,
          flight: data.flight ?? null,
          message: data.message ?? null,
          events_count: events.length,
          raw_meta: data.raw_meta ?? null,
          milestone_projection,
        }),
        domainName,
        currentHash
      ]
    );
  } else {
    await p.query(
      `INSERT INTO leg_status_summary
         (tenant_id, shipment_id, leg_sequence, aggregated_status, last_event_at, summary, updated_at, last_event_list_hash)
       VALUES ($1, $2, 1, $3, NOW(), $4, NOW(), $5)
       ON CONFLICT (tenant_id, shipment_id, leg_sequence) DO UPDATE SET
         aggregated_status = EXCLUDED.aggregated_status,
         last_event_at     = EXCLUDED.last_event_at,
         summary           = EXCLUDED.summary,
         updated_at        = EXCLUDED.updated_at,
         last_event_list_hash = EXCLUDED.last_event_list_hash`,
      [
        tenantId,
        hawbKey,
        statusStoredInSummary,
        JSON.stringify({
          ata: safeDateStr(ataEvent),
          eta: safeDateStr(etaEvent),
          etd: safeDateStr(etdEvent),
          origin: data.origin ?? null,
          destination: data.destination ?? null,
          airline: data.airline ?? null,
          flight: data.flight ?? null,
          message: data.message ?? null,
          events_count: events.length,
          raw_meta: data.raw_meta ?? null,
          milestone_projection,
        }),
        currentHash
      ]
    );
  }

  // 3. Replace previous events in query_events with fresh set
  await p.query(
    `DELETE FROM query_events WHERE tenant_id = $1 AND mawb = $2 AND hawb = $3`,
    [tenantId, mawb, hawbKey]
  );
  
  if (sorted.length > 0) {
    for (const ev of sorted) {
      await p.query(
        `INSERT INTO query_events
           (tenant_id, mawb, hawb, provider, source, occurred_at, status_code, status_text, location, weight, pieces, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          tenantId,
          mawb,
          hawbKey,
          data.airline ?? "unknown",
          ev.source ?? "airline",
          safeDateStr(ev.date),
          ev.status_code ?? null,
          ev.status ?? null,
          ev.location ?? null,
          ev.weight ?? null,
          ev.pieces ?? null,
          JSON.stringify(ev),
        ]
      );
    }
  }

  // HTTP response must mirror what we persist (merged airline + deduped + milestone),
  // otherwise "Sync Now" showed a projection built before ground_only/DB airline restore.
  data.events = sorted;
  data.status = wasArchivedShipment ? "Archived" : derivedStatus;
  data.milestone_projection = milestone_projection;

  // Stop polling once the shipment is terminal-delivered for UX (Need Attention / Open lists).
  // isFullyDelivered alone misses cases where status shows Delivered but piece math stayed "partial".
  const derivedNorm = String(derivedStatus ?? "").trim().toLowerCase();
  const terminalDeliveredStatus =
    derivedNorm === "delivered" ||
    derivedNorm.startsWith("delivered to origin") ||
    derivedNorm === "status dlv";
  const stopActivePolling = isFullyDelivered || terminalDeliveredStatus;

  if (stopActivePolling) {
    await p.query(
      `DELETE FROM query_schedule WHERE tenant_id = $1 AND mawb = $2 AND hawb = $3`,
      [tenantId, mawb, hawbKey]
    );
  }
}

/** GET /api/track/list — Returns aggregated Tracking Schedule for Admin Dashboard */
router.get("/list", authOptional, requireAuthenticated, async (req, res) => {
  const p = getPool();
  if (!p) {
    res.status(500).json({ error: "DB not connected" });
    return;
  }
  
  try {
    const user = (req as any).user;
    // Explicit dynamic aggregations extracting physical locations and counts
    // Uses a CTE to resolve true origin/destination from multi-leg Excel chains
    // (e.g., TLV→ALA→HKG→PVG: origin=TLV, dest=PVG)
    const query = `
      WITH excel_routes AS (
        -- Resolve the true first origin and final destination from the leg chain.
        -- True origin = load port that never appears as a discharge port (start of chain)
        -- True dest = discharge port that never appears as a load port (end of chain)
        SELECT 
          e1.tenant_id, e1.master_awb, e1.house_ref,
          CASE 
            WHEN LENGTH(MIN(CASE 
              WHEN e1.leg_load_port IS NOT NULL AND e1.leg_load_port != '' 
                AND e1.leg_load_port NOT IN (
                  SELECT COALESCE(e2.leg_discharge_port,'') 
                  FROM excel_transport_lines e2 
                  WHERE e2.master_awb = e1.master_awb AND e2.house_ref = e1.house_ref AND e2.tenant_id = e1.tenant_id
                )
              THEN e1.leg_load_port END)) = 5
            THEN RIGHT(MIN(CASE 
              WHEN e1.leg_load_port IS NOT NULL AND e1.leg_load_port != ''
                AND e1.leg_load_port NOT IN (
                  SELECT COALESCE(e2.leg_discharge_port,'') 
                  FROM excel_transport_lines e2 
                  WHERE e2.master_awb = e1.master_awb AND e2.house_ref = e1.house_ref AND e2.tenant_id = e1.tenant_id
                )
              THEN e1.leg_load_port END), 3)
            ELSE MIN(CASE 
              WHEN e1.leg_load_port IS NOT NULL AND e1.leg_load_port != ''
                AND e1.leg_load_port NOT IN (
                  SELECT COALESCE(e2.leg_discharge_port,'') 
                  FROM excel_transport_lines e2 
                  WHERE e2.master_awb = e1.master_awb AND e2.house_ref = e1.house_ref AND e2.tenant_id = e1.tenant_id
                )
              THEN e1.leg_load_port END)
          END as true_origin,
          CASE 
            WHEN LENGTH(MIN(CASE 
              WHEN e1.leg_discharge_port IS NOT NULL AND e1.leg_discharge_port != '' 
                AND e1.leg_discharge_port NOT IN (
                  SELECT COALESCE(e2.leg_load_port,'') 
                  FROM excel_transport_lines e2 
                  WHERE e2.master_awb = e1.master_awb AND e2.house_ref = e1.house_ref AND e2.tenant_id = e1.tenant_id
                )
              THEN e1.leg_discharge_port END)) = 5
            THEN RIGHT(MIN(CASE 
              WHEN e1.leg_discharge_port IS NOT NULL AND e1.leg_discharge_port != ''
                AND e1.leg_discharge_port NOT IN (
                  SELECT COALESCE(e2.leg_load_port,'') 
                  FROM excel_transport_lines e2 
                  WHERE e2.master_awb = e1.master_awb AND e2.house_ref = e1.house_ref AND e2.tenant_id = e1.tenant_id
                )
              THEN e1.leg_discharge_port END), 3)
            ELSE MIN(CASE 
              WHEN e1.leg_discharge_port IS NOT NULL AND e1.leg_discharge_port != ''
                AND e1.leg_discharge_port NOT IN (
                  SELECT COALESCE(e2.leg_load_port,'') 
                  FROM excel_transport_lines e2 
                  WHERE e2.master_awb = e1.master_awb AND e2.house_ref = e1.house_ref AND e2.tenant_id = e1.tenant_id
                )
              THEN e1.leg_discharge_port END)
          END as true_dest,
          COUNT(DISTINCT e1.id) as leg_count,
          SUM(COALESCE(e1.pieces_pcs, 1)) as total_pieces
        FROM excel_transport_lines e1
        GROUP BY e1.tenant_id, e1.master_awb, e1.house_ref
      )
      SELECT 
        q.tenant_id,
        q.domain_name,
        q.mawb,
        q.hawb,
        q.last_check_at as last_query_date,
        COALESCE(er.leg_count, 0) as number_of_legs,
        COALESCE(er.total_pieces, 0) as number_of_pieces,
        COALESCE(
          NULLIF(
            CASE
              WHEN MAX(lss.summary->>'origin') ~ '[(][A-Z]{3}[)]' 
              THEN SUBSTRING(MAX(lss.summary->>'origin') FROM '[(]([A-Z]{3})[)]')
              WHEN MAX(lss.summary->>'origin') ~ '^[A-Z]{3} [(]' 
              THEN SUBSTRING(MAX(lss.summary->>'origin') FROM '^([A-Z]{3})')
              ELSE MAX(lss.summary->>'origin')
            END,
          ''),
          er.true_origin,
          ''
        ) as origin,
        COALESCE(
          NULLIF(
            CASE
              WHEN MAX(lss.summary->>'destination') ~ '[(][A-Z]{3}[)]' 
              THEN SUBSTRING(MAX(lss.summary->>'destination') FROM '[(]([A-Z]{3})[)]')
              WHEN MAX(lss.summary->>'destination') ~ '^[A-Z]{3} [(]' 
              THEN SUBSTRING(MAX(lss.summary->>'destination') FROM '^([A-Z]{3})')
              ELSE MAX(lss.summary->>'destination')
            END,
          ''),
          er.true_dest,
          ''
        ) as destination,
        MAX(lss.summary->>'eta') as eta,
        MAX(lss.summary->>'ata') as ata,
        CASE WHEN MAX(q.error_count_consecutive) >= 3 THEN 'Query Blocked' ELSE MAX(lss.aggregated_status) END as status
      FROM query_schedule q
      LEFT JOIN excel_routes er ON 
        er.tenant_id = q.tenant_id AND er.master_awb = q.mawb AND er.house_ref = q.hawb
      LEFT JOIN leg_status_summary lss ON lss.tenant_id = q.tenant_id AND lss.shipment_id = q.hawb
      WHERE ${user?.role === 'admin' ? '1=1' : 'q.tenant_id = $1'}
      GROUP BY q.tenant_id, q.domain_name, q.mawb, q.hawb, q.last_check_at, er.true_origin, er.true_dest, er.leg_count, er.total_pieces
      ORDER BY q.last_check_at DESC NULLS LAST
      LIMIT 200
    `;
    const params = user?.role === 'admin' ? [] : [user?.tenant_id];
    const pendingQuery = await p.query(query, params);
    res.json({ awbs: pendingQuery.rows });
  } catch (err) {
    console.error("GET /api/track/list error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

/** GET /api/track/active-queries — Returns list of active queries with durations for Admin Dashboard */
router.get("/active-queries", authOptional, requireAuthenticated, async (req, res) => {
  const p = getPool();
  if (!p) {
    res.status(500).json({ error: "DB not connected" });
    return;
  }
  
  try {
    const user = (req as any).user;
    const query = `
      SELECT 
        qs.domain_name as customer,
        qs.mawb,
        qs.hawb,
        qs.last_check_at as last_query_date,
        EXTRACT(EPOCH FROM (NOW() - qs.created_at)) / 86400 as active_time_days
      FROM query_schedule qs
      WHERE ${user?.role === 'admin' ? '1=1' : 'qs.tenant_id = $1'}
      ORDER BY qs.last_check_at DESC NULLS LAST
    `;
    const params = user?.role === 'admin' ? [] : [user?.tenant_id];
    const result = await p.query(query, params);
    res.json({ active_queries: result.rows });
  } catch (err) {
    console.error("GET /api/track/active-queries error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

/** GET /api/track/stored/:mawb/:hawb — Read persisted events from DB (no live tracker call) */
router.get("/stored/:mawb/:hawb", authOptional, requireAuthenticated, async (req, res) => {
  const p = getPool();
  if (!p) { res.status(500).json({ error: "DB not connected" }); return; }
  const user = (req as any).user;
  const { mawb, hawb } = req.params;
  const mawbClean = mawb.replace(/-/g, "");
  const hawbKey = hawb === mawbClean ? mawbClean : hawb;

  try {
    const isAdmin = user?.role === 'admin';
    
    const summaryRes = await p.query(
      `SELECT tenant_id, aggregated_status, summary, last_event_at, updated_at
       FROM leg_status_summary
       WHERE ${isAdmin ? '1=1' : 'tenant_id = $1'} AND shipment_id = ${isAdmin ? '$1' : '$2'}
       ORDER BY leg_sequence ASC`,
      isAdmin ? [hawbKey] : [user?.tenant_id, hawbKey]
    );
    const eventsRes = await p.query(
      `SELECT payload, occurred_at, status_code, status_text, location, weight, pieces, source, provider
       FROM query_events
       WHERE ${isAdmin ? '1=1' : 'tenant_id = $1'} AND mawb = ${isAdmin ? '$1' : '$2'} AND hawb = ${isAdmin ? '$2' : '$3'}
       ORDER BY occurred_at ASC NULLS LAST`,
      isAdmin ? [mawbClean, hawbKey] : [user?.tenant_id, mawbClean, hawbKey]
    );

    if (summaryRes.rows.length === 0 && eventsRes.rows.length === 0) {
      res.status(404).json({ error: "No stored data found. Run a live query first." });
      return;
    }

    const summaryRaw = summaryRes.rows[0]?.summary ?? {};
    const summary =
      typeof summaryRaw === "string"
        ? (() => {
            try {
              return JSON.parse(summaryRaw) as Record<string, unknown>;
            } catch {
              return {} as Record<string, unknown>;
            }
          })()
        : summaryRaw;
    const events = eventsRes.rows.map((r: any) => {
      try { return typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload; }
      catch { return { status_code: r.status_code, status: r.status_text, location: r.location, date: r.occurred_at, weight: r.weight, pieces: r.pieces, source: r.source }; }
    });

    const smRm = summary.raw_meta as Record<string, unknown> | undefined;
    const persistedExtras =
      smRm && typeof smRm === "object" && !Array.isArray(smRm) ? { ...smRm } : {};

    let responseData: any = {
      airline: summary.airline ?? "unknown",
      awb: mawbClean,
      hawb: hawbKey,
      origin: summary.origin ?? null,
      destination: summary.destination ?? null,
      status: summaryRes.rows[0]?.aggregated_status ?? null,
      flight: summary.flight ?? null,
      events,
      message: summary.message ?? `Loaded from DB — ${events.length} events`,
      blocked: false,
      raw_meta: {
        source: "database",
        last_synced: summaryRes.rows[0]?.updated_at ?? null,
        ...persistedExtras,
      },
    };

    const actualTenantId = isAdmin ? summaryRes.rows[0]?.tenant_id : user?.tenant_id;
    responseData = await appendExcelDatesToTrackingData(actualTenantId, mawbClean, hawbKey, responseData);
    responseData.events = responseData.events || [];
    try {
      await merge047TapIntoTrackingPayload(responseData);
    } catch (e: any) {
      console.warn("[GET /stored] TAP merge skipped:", e?.message ?? e);
    }
    if (milestoneEnrichmentEnabled()) enrichTrackingPayloadWithMilestone(responseData);
    else if (typeof summary?.milestone_projection === "object" && summary?.milestone_projection !== null) {
      responseData.milestone_projection = summary.milestone_projection;
    }
    res.json(responseData);
  } catch (err) {
    console.error("GET /api/track/stored error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

let activeWorkerTotal = 0;
let activeWorkerQueue = 0;

/** GET /api/track/worker-status — Returns real-time metrics of the background pump */
router.get("/worker-status", authOptional, requireAuthenticated, (req, res) => {
  res.json({ active: activeWorkerTotal, queued: activeWorkerQueue });
});

/** POST /api/track/run-scheduled — Triggered by n8n or cron to run pending tracking jobs */
router.post("/run-scheduled", async (req, res) => {
  const startMs = Date.now();
  const p = getPool();
  if (!p) {
    res.status(500).json({ error: "DB not connected" });
    return;
  }
  
  try {
    // 1. Check for dormancy (no change in 24 hours) and alert
    const stagnantQuery = await p.query(
      `SELECT tenant_id, mawb, hawb FROM query_schedule WHERE stale_alert_sent = false AND last_changed_at <= NOW() - interval '24 hours'`
    );
    if (stagnantQuery.rows.length > 0) {
      for (const row of stagnantQuery.rows) {
        await p.query(
          `INSERT INTO awb_latest_change (tenant_id, mawb, hawb, event_type, payload) VALUES ($1, $2, $3, 'STALE_24H', $4)`,
          [row.tenant_id, row.mawb, row.hawb, JSON.stringify({ message: "No change detected in the past 24 hours" })]
        );
        await p.query(
          `UPDATE query_schedule SET stale_alert_sent = true WHERE tenant_id = $1 AND mawb = $2 AND hawb = $3`,
          [row.tenant_id, row.mawb, row.hawb]
        );
      }
    }

    // 1. Global concurrency lock: don't fetch new jobs if we are already saturated
    if (activeWorkerTotal >= 5) {
      res.json({ message: "Worker busy", count: 0 });
      return;
    }

    // Fetch up to 100 pending tracking jobs, excluding those already Delivered
    const pendingQuery = await p.query(
      `SELECT q.tenant_id, q.mawb, q.hawb, q.ground_only 
       FROM query_schedule q
       LEFT JOIN leg_status_summary l ON l.tenant_id = q.tenant_id AND l.shipment_id = COALESCE(q.hawb, q.mawb) AND l.leg_sequence = 1
       WHERE q.next_status_check_at <= now() 
         AND q.is_halted = false 
         AND COALESCE(l.aggregated_status, '') NOT IN ('Status DLV', 'Delivered', 'Delivered to origin')
       LIMIT 100`
    );
    
    // Lock them in DB immediately to prevent concurrent triggers picking them up
    if (pendingQuery.rows.length > 0) {
      const valuesParam = pendingQuery.rows.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(",");
      const flatParams = pendingQuery.rows.flatMap(r => [r.tenant_id, r.mawb, r.hawb]);
      await p.query(`
        UPDATE query_schedule
        SET next_status_check_at = NOW() + interval '10 minutes'
        WHERE (tenant_id, mawb, hawb) IN (${valuesParam})
      `, flatParams);
    }
    
    // Process them asynchronously so we don't hold the n8n request too long
    setTimeout(() => {
      const queue = [...pendingQuery.rows];
      activeWorkerQueue += queue.length;
      
      let localActiveTotal = 0;
      const activeAirlines: Record<string, number> = {};

        const pump = () => {
          if (queue.length === 0 && localActiveTotal === 0) return;

          while (activeWorkerTotal < 5 && queue.length > 0) {
            const idx = queue.findIndex(r => {
              const prefix = r.mawb.substring(0, 3);
              return (activeAirlines[prefix] || 0) < 2;
            });

          if (idx === -1) break;

          const [row] = queue.splice(idx, 1);
          const prefix = row.mawb.substring(0, 3);

          localActiveTotal++;
          activeWorkerTotal++;
          activeWorkerQueue--;
          activeAirlines[prefix] = (activeAirlines[prefix] || 0) + 1;

          (async () => {
            const processingStartMs = Date.now();
            try {
              const hawbForTracker = hawbQueryParamForLiveTrack(row.mawb, row.hawb ?? undefined);
              const { data } = await trackByAwb(row.mawb, hawbForTracker, row.ground_only);
              await saveTrackingResult(row.tenant_id, row.mawb, row.hawb, data);
              
              const durations = data.raw_meta?.durations as { airline?: number; ground?: number } | undefined;
              const attempts = data.raw_meta?.attempts as { airline?: number; ground?: number } | undefined;
              
              logQueryRequest(undefined, row.tenant_id, row.mawb, row.hawb, data.airline ?? "auto", data.status || (data.events?.length === 0 ? "No Data" : "Success"), Math.round((durations?.airline ?? 0) * 1000) || Date.now() - processingStartMs, data.message);

              if (attempts?.ground && attempts.ground > 0) {
                const groundService = data.message?.match(/\| (maman|swissport)/)?.[1] ?? "ground";
                const groundStatus = data.message?.includes("timed_out") ? "Timeout" : data.message?.includes("ground_skipped") ? "Skipped" : data.message?.includes(`${groundService}_synced`) ? data.status || "Success" : "No Data";
                logQueryRequest(undefined, row.tenant_id, row.mawb, row.hawb, groundService, groundStatus, Math.round((durations?.ground ?? 0) * 1000), data.message);
              }

            } catch (e) {
              console.error(`Scheduled scan failed for ${row.mawb}:`, e);
              logQueryRequest(undefined, row.tenant_id, row.mawb, row.hawb, "system", "Error", Date.now() - processingStartMs, e instanceof Error ? e.message : String(e));
              
              // Handle error thresholds map
              const errRes = await p.query(
                `UPDATE query_schedule 
                 SET error_count_consecutive = error_count_consecutive + 1,
                     next_status_check_at = NOW() + interval '10 minutes'
                 WHERE tenant_id = $1 AND mawb = $2 AND hawb = $3
                 RETURNING error_count_consecutive`,
                [row.tenant_id, row.mawb, row.hawb]
              );
              
              const currentErrors = errRes.rows[0]?.error_count_consecutive || 0;
              if (currentErrors >= 3) {
                  // Hit the threshold lock
                  await p.query(
                    `UPDATE query_schedule SET is_halted = true WHERE tenant_id = $1 AND mawb = $2 AND hawb = $3`,
                    [row.tenant_id, row.mawb, row.hawb]
                  );
                  await p.query(
                    `INSERT INTO awb_latest_change (tenant_id, mawb, hawb, event_type, payload) VALUES ($1, $2, $3, 'SLACK_ALERT', $4)`,
                    [row.tenant_id, row.mawb, row.hawb, JSON.stringify({ message: "3 consecutive query errors hit via background scan. Querying halted explicitly." })]
                  );
              }
            } finally {
              localActiveTotal--;
              activeWorkerTotal--;
              activeAirlines[prefix]--;
              pump();
            }
          })();
        }
      };
      
      pump();
      
    }, 0);

    res.json({ message: "Started tracking jobs", count: pendingQuery.rows.length });
  } catch (err) {
    console.error("run-scheduled error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

/** GET /api/track/:airline/:awb — track by airline + AWB. Admin only. (Must be before /:awb.) */
router.get("/:airline/:awb", authOptional, requireAuthenticated, async (req, res) => {
  const { airline, awb } = req.params;
  const { hawb } = req.query;
  if (!airline || !awb) {
    res.status(400).json({ error: "airline and awb required" });
    return;
  }
  const startMs = Date.now();
  try {
    const hawbRaw = typeof hawb === "string" ? hawb.trim() : "";
    const hawbPersist = hawbRaw !== "" ? hawbRaw : undefined;
    const hawbForTracker = hawbQueryParamForLiveTrack(awb, hawbPersist);
    const { data, status } = await trackByAirline(airline, awb, hawbForTracker);
    const user = (req as any).user;
    const durations = data.raw_meta?.durations as { airline?: number; ground?: number } | undefined;
    const attempts = data.raw_meta?.attempts as { airline?: number; ground?: number } | undefined;
    logQueryRequest(user?.sub, user?.tenant_id, awb, hawbPersist ?? "", airline, data.status || (data.events?.length === 0 ? "No Data" : "Success"), Math.round((durations?.airline ?? 0) * 1000) || Date.now() - startMs, data.message);
    // Log ground service if queried
    if (attempts?.ground && attempts.ground > 0) {
      const groundService = data.message?.match(/\| (maman|swissport)/)?.[1] ?? "ground";
      const groundStatus = data.message?.includes("timed_out") ? "Timeout" : data.message?.includes("ground_skipped") ? "Skipped" : data.message?.includes(`${groundService}_synced`) ? data.status || "Success" : "No Data";
      logQueryRequest(user?.sub, user?.tenant_id, awb, hawbPersist ?? "", groundService, groundStatus, Math.round((durations?.ground ?? 0) * 1000));
    }

    const mawbClean = awb.replace(/-/g, "");
    const hawbQ = hawbPersist;
    const tenantId = await getActualTenantId(user, mawbClean, hawbQ);
    await appendExcelDatesToTrackingData(tenantId, mawbClean, hawbQ, data);
    data.events = data.events ?? [];
    await mergePersistedAirlineEventsWhenLiveTrackerFailed(data, tenantId, mawbClean, hawbQ);
    try {
      await merge047TapIntoTrackingPayload(data as unknown as Record<string, unknown>);
    } catch (e: any) {
      console.warn("[GET /track/:airline] TAP merge skipped:", e?.message ?? e);
    }
    await persistLiveEnrichedTracking(user, mawbClean, hawbQ, data);
    if (milestoneEnrichmentEnabled() && !data.milestone_projection) {
      enrichTrackingPayloadWithMilestone(data);
    }

    res.status(status).json(data);
  } catch (err) {
    console.error("trackByAirline error:", err);
    const user = (req as any).user;
    logQueryRequest(user?.sub, user?.tenant_id, awb, typeof hawb === "string" ? hawb.trim() : "", airline, "Error", Date.now() - startMs);
    res.status(502).json({
      airline,
      awb,
      events: [],
      message: err instanceof Error ? err.message : "Track service error",
      blocked: true,
    });
  }
});

/** GET /api/track/:awb — track by AWB only (airline from prefix). Admin only. */
router.get("/:awb", authOptional, requireAuthenticated, async (req, res) => {
  const { awb } = req.params;
  const { hawb } = req.query;
  if (!awb) {
    res.status(400).json({ error: "awb required" });
    return;
  }
  const startMs = Date.now();
  try {
    const hawbRaw = typeof hawb === "string" ? hawb.trim() : "";
    const hawbPersist = hawbRaw !== "" ? hawbRaw : undefined;
    const hawbForTracker = hawbQueryParamForLiveTrack(awb, hawbPersist);
    const { data, status } = await trackByAwb(awb, hawbForTracker);
    const user = (req as any).user;
    const durations = data.raw_meta?.durations as { airline?: number; ground?: number } | undefined;
    const attempts = data.raw_meta?.attempts as { airline?: number; ground?: number } | undefined;
    // Log airline query
    logQueryRequest(user?.sub, user?.tenant_id, awb, hawbPersist ?? "", data.airline ?? "unknown", data.status || (data.events?.length === 0 ? "No Data" : "Success"), Math.round((durations?.airline ?? 0) * 1000) || Date.now() - startMs);
    // Log ground service if queried
    if (attempts?.ground && attempts.ground > 0) {
      const groundService = data.message?.match(/\| (maman|swissport)/)?.[1] ?? "ground";
      const groundStatus = data.message?.includes("timed_out") ? "Timeout" : data.message?.includes("ground_skipped") ? "Skipped" : data.message?.includes(`${groundService}_synced`) ? data.status || "Success" : "No Data";
      logQueryRequest(user?.sub, user?.tenant_id, awb, hawbPersist ?? "", groundService, groundStatus, Math.round((durations?.ground ?? 0) * 1000));
    }

    const mawbClean = awb.replace(/-/g, "");
    const hawbQ = hawbPersist;
    const tenantId = await getActualTenantId(user, mawbClean, hawbQ);
    await appendExcelDatesToTrackingData(tenantId, mawbClean, hawbQ, data);
    data.events = data.events ?? [];
    await mergePersistedAirlineEventsWhenLiveTrackerFailed(data, tenantId, mawbClean, hawbQ);
    try {
      await merge047TapIntoTrackingPayload(data as unknown as Record<string, unknown>);
    } catch (e: any) {
      console.warn("[GET /track/:awb] TAP merge skipped:", e?.message ?? e);
    }
    await persistLiveEnrichedTracking(user, mawbClean, hawbQ, data);
    if (milestoneEnrichmentEnabled() && !data.milestone_projection) {
      enrichTrackingPayloadWithMilestone(data);
    }

    res.status(status).json(data);
  } catch (err) {
    console.error("trackByAwb error:", err);
    const user = (req as any).user;
    logQueryRequest(user?.sub, user?.tenant_id, awb, typeof hawb === "string" ? hawb.trim() : "", "unknown", "Error", Date.now() - startMs);
    res.status(502).json({
      airline: "unknown",
      awb,
      events: [],
      message: err instanceof Error ? err.message : "Track service error",
      blocked: true,
    });
  }
});

/** POST /api/track/mark-delivered/:mawb/:hawb — Mark a shipment as delivered manually */
router.post("/mark-delivered/:mawb/:hawb", authOptional, requireAuthenticated, async (req, res) => {
  const p = getPool();
  if (!p) { res.status(500).json({ error: "DB not connected" }); return; }
  const user = (req as any).user;
  if (!user?.tenant_id) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Admin can act on any tenant's shipment by passing ?tenant_id=...
  const effectiveTenantId = (user.role === 'admin' && req.query.tenant_id)
    ? req.query.tenant_id as string
    : user.tenant_id;

  const { mawb, hawb } = req.params;
  const mawbClean = mawb.replace(/-/g, "");
  const hawbKey = hawb === mawbClean ? mawbClean : hawb;

  try {
    await p.query("BEGIN");
    
    // 1. Remove from query_schedule so it disappears from the view and scheduled tasks
    await p.query(
      `DELETE FROM query_schedule WHERE tenant_id = $1 AND mawb = $2 AND hawb = $3`,
      [effectiveTenantId, mawbClean, hawbKey]
    );

    // 2. Add manual DLV event to query_events
    await p.query(
      `INSERT INTO query_events
         (tenant_id, mawb, hawb, provider, source, occurred_at, status_code, status_text, location, weight, pieces, payload)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11)`,
      [
        effectiveTenantId,
        mawbClean,
        hawbKey,
        "manual",
        "manual",
        "DLV",
        "Delivered",
        "Manual Entry",
        null, // weight
        null, // pieces
        JSON.stringify({ remarks: "Marked as delivered manually" })
      ]
    );

    // 3. Update leg_status_summary
    await p.query(
      `UPDATE leg_status_summary 
       SET aggregated_status = 'Delivered', updated_at = NOW()
       WHERE tenant_id = $1 AND shipment_id = $2`,
      [effectiveTenantId, hawbKey]
    );
    
    await p.query("COMMIT");
    res.json({ ok: true, mawb: mawbClean, hawb: hawbKey });
  } catch (err) {
    await p.query("ROLLBACK").catch(() => {});
    console.error("POST /api/track/mark-delivered error:", err);
    res.status(500).json({ error: "Failed to mark shipment as delivered" });
  }
});

/** POST /api/track/mark-archived/:mawb/:hawb — Mark a shipment as archived manually */
router.post("/mark-archived/:mawb/:hawb", authOptional, requireAuthenticated, async (req, res) => {
  const p = getPool();
  if (!p) { res.status(500).json({ error: "DB not connected" }); return; }
  const user = (req as any).user;
  if (!user?.tenant_id) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { mawb, hawb } = req.params;
  const mawbClean = mawb.replace(/-/g, "");
  const hawbKey = hawb === mawbClean ? mawbClean : hawb;

  try {
    await p.query("BEGIN");
    
    // 1. Remove from query_schedule so it disappears from active views
    await p.query(
      `DELETE FROM query_schedule WHERE tenant_id = $1 AND mawb = $2 AND hawb = $3`,
      [user.tenant_id, mawbClean, hawbKey]
    );

    // 2. Add manual ARCHIVED event to query_events
    await p.query(
      `INSERT INTO query_events
         (tenant_id, mawb, hawb, provider, source, occurred_at, status_code, status_text, location, weight, pieces, payload)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11)`,
      [
        user.tenant_id,
        mawbClean,
        hawbKey,
        "manual",
        "manual",
        "ARC",
        "Archived",
        "Manual Entry",
        null,
        null,
        JSON.stringify({ remarks: "Marked as archived manually" })
      ]
    );

    // 3. Update leg_status_summary
    await p.query(
      `UPDATE leg_status_summary 
       SET aggregated_status = 'Archived', updated_at = NOW()
       WHERE tenant_id = $1 AND shipment_id = $2`,
      [user.tenant_id, hawbKey]
    );
    
    await p.query("COMMIT");
    res.json({ ok: true, mawb: mawbClean, hawb: hawbKey });
  } catch (err) {
    await p.query("ROLLBACK").catch(() => {});
    console.error("POST /api/track/mark-archived error:", err);
    res.status(500).json({ error: "Failed to mark shipment as archived" });
  }
});

/** POST /api/track/archive-delivered-bulk — Move every delivered shipment to archived (remove schedule, set status, optional ARC audit row). */
router.post("/archive-delivered-bulk", authOptional, requireAuthenticated, async (req, res) => {
  const p = getPool();
  if (!p) {
    res.status(500).json({ error: "DB not connected" });
    return;
  }

  const user = (req as any).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const tenantFilter =
    user.role === "admin" && typeof req.query.tenant_id === "string" && req.query.tenant_id.length > 0
      ? (req.query.tenant_id as string)
      : user.role === "admin"
        ? null
        : user.tenant_id;

  if (!tenantFilter && user.role !== "admin") {
    res.status(403).json({ error: "Tenant required" });
    return;
  }

  const deliveredStatuses = ["Delivered", "Delivered to origin", "Status DLV"];
  const arcPayload = { remarks: "Bulk archive: delivered shipments moved to archived" };

  try {
    await p.query("BEGIN");

    const delSchedule = await p.query(
      `DELETE FROM query_schedule qs
       USING leg_status_summary ls
       WHERE qs.tenant_id = ls.tenant_id
         AND ls.leg_sequence = 1
         AND ls.shipment_id = COALESCE(qs.hawb, qs.mawb)
         AND ls.aggregated_status = ANY($2::text[])
         AND ($1::uuid IS NULL OR qs.tenant_id = $1::uuid)`,
      [tenantFilter, deliveredStatuses],
    );

    const arcInsert = await p.query(
      `INSERT INTO query_events
         (tenant_id, mawb, hawb, provider, source, occurred_at, status_code, status_text, location, weight, pieces, payload)
       SELECT DISTINCT ON (qe.tenant_id, qe.mawb, qe.hawb)
         qe.tenant_id,
         qe.mawb,
         qe.hawb,
         'system',
         'bulk_archive',
         NOW(),
         'ARC',
         'Archived',
         NULL,
         NULL,
         NULL,
         $3::jsonb
       FROM query_events qe
       INNER JOIN leg_status_summary ls
         ON ls.tenant_id = qe.tenant_id
         AND ls.leg_sequence = 1
         AND ls.shipment_id = COALESCE(qe.hawb, qe.mawb)
       WHERE ls.aggregated_status = ANY($2::text[])
         AND ($1::uuid IS NULL OR ls.tenant_id = $1::uuid)
         AND NOT EXISTS (
           SELECT 1 FROM query_events prev
           WHERE prev.tenant_id = qe.tenant_id
             AND prev.mawb = qe.mawb
             AND COALESCE(prev.hawb, '') = COALESCE(qe.hawb, '')
             AND prev.status_code = 'ARC'
         )
       ORDER BY qe.tenant_id, qe.mawb, qe.hawb, qe.occurred_at DESC NULLS LAST`,
      [tenantFilter, deliveredStatuses, arcPayload],
    );

    const updSummary = await p.query(
      `UPDATE leg_status_summary ls
       SET aggregated_status = 'Archived', updated_at = NOW()
       WHERE ls.leg_sequence = 1
         AND ls.aggregated_status = ANY($2::text[])
         AND ($1::uuid IS NULL OR ls.tenant_id = $1::uuid)`,
      [tenantFilter, deliveredStatuses],
    );

    await p.query("COMMIT");

    res.json({
      ok: true,
      query_schedule_removed: delSchedule.rowCount ?? 0,
      arc_events_inserted: arcInsert.rowCount ?? 0,
      leg_status_summary_updated: updSummary.rowCount ?? 0,
    });
  } catch (err) {
    await p.query("ROLLBACK").catch(() => {});
    console.error("POST /api/track/archive-delivered-bulk error:", err);
    res.status(500).json({ error: "Failed to bulk-archive delivered shipments" });
  }
});

/** DELETE /api/track/remove/:mawb/:hawb — Remove a shipment from all tracking tables */
router.delete("/remove/:mawb/:hawb", authOptional, requireAuthenticated, async (req, res) => {
  const p = getPool();
  if (!p) { res.status(500).json({ error: "DB not connected" }); return; }
  const user = (req as any).user;
  if (!user?.tenant_id) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Admin can act on any tenant's shipment by passing ?tenant_id=...
  const effectiveTenantId = (user.role === 'admin' && req.query.tenant_id)
    ? req.query.tenant_id as string
    : user.tenant_id;

  const { mawb, hawb } = req.params;
  const mawbClean = mawb.replace(/-/g, "");
  const hawbKey = hawb === mawbClean ? mawbClean : hawb;

  try {
    await p.query("BEGIN");
    await p.query(
      `DELETE FROM query_schedule WHERE tenant_id = $1 AND mawb = $2 AND hawb = $3`,
      [effectiveTenantId, mawbClean, hawbKey]
    );
    await p.query(
      `DELETE FROM query_events WHERE tenant_id = $1 AND mawb = $2 AND hawb = $3`,
      [effectiveTenantId, mawbClean, hawbKey]
    );
    await p.query(
      `DELETE FROM leg_status_summary WHERE tenant_id = $1 AND shipment_id = $2`,
      [effectiveTenantId, hawbKey]
    );
    await p.query("COMMIT");
    res.json({ ok: true, mawb: mawbClean, hawb: hawbKey });
  } catch (err) {
    await p.query("ROLLBACK").catch(() => {});
    console.error("DELETE /api/track/remove error:", err);
    res.status(500).json({ error: "Failed to remove shipment" });
  }
});
export default router;

