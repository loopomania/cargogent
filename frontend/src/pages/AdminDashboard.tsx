import { useState } from "react";
import { trackByAwb, trackByAirline, type TrackingEvent, type TrackingResponse } from "../lib/api";
import MilestonePlan from "../components/MilestonePlan";

const AIRLINES = [
  { value: "", label: "Auto (from AWB)" },
  { value: "elal", label: "El Al" },
  { value: "lufthansa", label: "Lufthansa" },
  { value: "delta", label: "Delta" },
  { value: "afklm", label: "AF/KLM" },
  { value: "united", label: "United" },
  { value: "cargopal", label: "PAL Cargo" },
  { value: "cathay", label: "Cathay" },
  { value: "ethiopian", label: "Ethiopian" },
  { value: "challenge", label: "Challenge" },
];

// ─── Date helpers ─────────────────────────────────────────────────────────────

import EventTimelineTable, { parseEventDate, extractPcs, extractKg, StatusBadge } from "../components/EventTimelineTable";

// ─── Anomaly detection ────────────────────────────────────────────────────────

interface Anomaly {
  kind: "etd_change" | "eta_change" | "weight_diff" | "pieces_diff";
  title: string;
  detail: string;
  severity: "warn" | "error";
}

function detectAnomalies(events: TrackingEvent[]): Anomaly[] {
  const anomalies: Anomaly[] = [];

  const airEvents = events.filter(e => e.source !== "ground");
  const groundEvents = events.filter(e => e.source === "ground");

  // Ground departure estimate vs airline ATD
  const groundDep = groundEvents.find(e => e.departure_date)?.departure_date;
  const airDep = airEvents.find(e => e.status_code === "DEP")?.date;
  if (groundDep && airDep) {
    const gDate = parseEventDate({ departure_date: groundDep } as TrackingEvent);
    const aDate = parseEventDate({ date: airDep } as TrackingEvent);
    const diffHrs = Math.abs(gDate.getTime() - aDate.getTime()) / 3_600_000;
    if (diffHrs > 1) {
      anomalies.push({
        kind: "etd_change",
        title: "ETD Changed",
        detail: `Ground estimated ${groundDep} → Airline ATD ${airDep} (${diffHrs.toFixed(1)}h diff)`,
        severity: diffHrs > 6 ? "error" : "warn",
      });
    }
  }

  // Ground arrival estimate vs airline ATA
  const groundArr = groundEvents.find(e => e.arrival_date)?.arrival_date;
  const airArr = airEvents.find(e => e.status_code === "ARR" || e.status_code === "RCF")?.date;
  if (groundArr && airArr) {
    const gDate = parseEventDate({ arrival_date: groundArr } as TrackingEvent);
    const aDate = parseEventDate({ date: airArr } as TrackingEvent);
    const diffHrs = Math.abs(gDate.getTime() - aDate.getTime()) / 3_600_000;
    if (diffHrs > 1) {
      anomalies.push({
        kind: "eta_change",
        title: "ETA Changed",
        detail: `Ground estimated ${groundArr} → Airline ATA ${airArr} (${diffHrs.toFixed(1)}h diff)`,
        severity: diffHrs > 6 ? "error" : "warn",
      });
    }
  }

  // Weight comparison
  const groundWeights = groundEvents.map(e => extractKg(e.weight)).filter(Boolean) as number[];
  const airWeights = airEvents.map(e => extractKg(e.weight)).filter(Boolean) as number[];
  const maxGround = groundWeights.length ? Math.max(...groundWeights) : null;
  const maxAir = airWeights.length ? Math.max(...airWeights) : null;
  if (maxGround !== null && maxAir !== null) {
    const pct = Math.abs(maxAir - maxGround) / Math.max(maxAir, maxGround);
    if (pct > 0.05) {
      anomalies.push({
        kind: "weight_diff",
        title: "Weight Discrepancy",
        detail: `Airline declared ${maxAir} kg, Ground received ${maxGround} kg (${(pct * 100).toFixed(1)}% difference)`,
        severity: pct > 0.15 ? "error" : "warn",
      });
    }
  }

  // Pieces comparison
  const groundPcs = groundEvents.map(e => extractPcs(e.actual_pieces || e.pieces)).filter(Boolean) as number[];
  const airPcs = airEvents.map(e => extractPcs(e.pieces)).filter((x): x is number => x !== null && x > 1);
  const maxGroundPcs = groundPcs.length ? Math.max(...groundPcs) : null;
  const maxAirPcs = airPcs.length ? Math.max(...airPcs) : null;
  if (maxGroundPcs !== null && maxAirPcs !== null && maxGroundPcs !== maxAirPcs) {
    // Determine if likely counting error (weight matches) or real difference
    const weightOk = maxGround !== null && maxAir !== null
      ? Math.abs(maxAir - maxGround) / Math.max(maxAir, maxGround) < 0.05
      : null;
    const reason = weightOk === true
      ? "Weight matches → likely a counting / labelling error"
      : "Weight also differs → some items may not have arrived";
    anomalies.push({
      kind: "pieces_diff",
      title: "Piece Count Mismatch",
      detail: `Airline: ${maxAirPcs} pcs, Ground: ${maxGroundPcs} pcs. ${reason}`,
      severity: weightOk === false ? "error" : "warn",
    });
  }

  return anomalies;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ANOMALY_COLOURS = {
  warn:  { bg: "rgba(255,152,0,0.12)", border: "#ff9800", icon: "⚠️", text: "#e65100" },
  error: { bg: "rgba(211,47,47,0.10)", border: "#d32f2f", icon: "🚨", text: "#b71c1c" },
};

function AnomalyCard({ a }: { a: Anomaly }) {
  const c = ANOMALY_COLOURS[a.severity];
  return (
    <div style={{
      display: "flex", gap: "0.6rem", alignItems: "flex-start",
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 8, padding: "0.65rem 1rem", marginBottom: "0.5rem",
    }}>
      <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>{c.icon}</span>
      <div>
        <span style={{ fontWeight: 700, color: c.text, fontSize: "0.85rem" }}>{a.title}:</span>{" "}
        <span style={{ color: c.text, fontSize: "0.83rem" }}>{a.detail}</span>
      </div>
    </div>
  );
}


/** Inline version of DatePair for use in the summary metrics grid */
function SummaryDatePair({
  estimatedLabel, estimated,
  actualLabel, actual,
}: {
  estimatedLabel: string; estimated?: string | null;
  actualLabel: string;   actual?: string | null;
}) {
  const hasEst = !!estimated;
  const hasAct = !!actual;
  const norm = (s?: string | null) => (s ?? "").trim().replace(/:\d{2}$/, "");
  const same = hasEst && hasAct && norm(estimated) === norm(actual);

  if (!hasEst && !hasAct) return <span style={{ fontFamily: "monospace", fontWeight: 600 }}>—</span>;

  // Only one side exists — show actual in green (confirmed), estimated in muted
  if (!hasEst && hasAct) {
    return <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "0.88rem", color: "#2e7d32" }}>{actual}</span>;
  }
  if (hasEst && !hasAct) {
    return <span style={{ fontFamily: "monospace", fontWeight: 600, fontSize: "0.88rem", color: "var(--text-muted)" }}>{estimated}</span>;
  }

  if (same) {
    return (
      <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "0.88rem", color: "#2e7d32" }}>
        {estimated}
      </span>
    );
  }

  const YELLOW = "#b45309";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontFamily: "monospace", fontWeight: 600, fontSize: "0.82rem", color: YELLOW }}>
        <span style={{ fontWeight: 400, fontSize: "0.65rem", marginRight: 3, opacity: 0.8 }}>{estimatedLabel}</span>
        {estimated}
      </span>
      <span style={{ fontFamily: "monospace", fontWeight: 600, fontSize: "0.82rem", color: YELLOW }}>
        <span style={{ fontWeight: 400, fontSize: "0.65rem", marginRight: 3, opacity: 0.8 }}>{actualLabel}</span>
        {actual}
      </span>
    </div>
  );
}


function getShipmentTimes(events: TrackingEvent[]) {
  if (!events.length) return { etd: null, atd: null, eta: null, ata: null };
  const sorted = [...events].sort((a, b) => parseEventDate(a).getTime() - parseEventDate(b).getTime());
  
  const atdEvent = sorted.find(e => e.status_code === "DEP");
  const atd = atdEvent ? atdEvent.date : null;
  
  const ataEvents = sorted.filter(e => ["ARR", "RCF", "NFD", "DLV"].includes(e.status_code || ""));
  const ata = ataEvents.length > 0 ? ataEvents[ataEvents.length - 1].date : null;
  
  const etdEvent = sorted.filter(e => e.departure_date).pop();
  const etd = etdEvent ? etdEvent.departure_date : null;
  
  const etaEvent = sorted.filter(e => e.arrival_date).pop();
  const eta = etaEvent ? etaEvent.arrival_date : null;
  
  return { etd, atd, eta, ata };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [airline, setAirline] = useState("");
  const [awb, setAwb] = useState("");
  const [hawb, setHawb] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<TrackingResponse | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setData(null);
    const a = awb.trim();
    if (!a) { setError("Enter AWB number"); return; }
    setLoading(true);
    try {
      const h = hawb.trim() || undefined;
      const res = airline ? await trackByAirline(airline, a, h) : await trackByAwb(a, h);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  const anomalies = data ? detectAnomalies(data.events) : [];
  const { etd, atd, eta, ata } = getShipmentTimes(data?.events || []);

  // Summary metrics
  const groundEvents = data?.events.filter(e => e.source === "ground") ?? [];
  const allWeights   = data?.events.map(e => extractKg(e.weight)).filter(Boolean) as number[] ?? [];
  const allPcs       = data?.events.map(e => extractPcs(e.pieces)).filter(Boolean) as number[] ?? [];
  const maxWeight    = allWeights.length ? Math.max(...allWeights) : extractKg(data?.raw_meta?.weight as string);
  const maxPcs       = allPcs.length ? Math.max(...allPcs) : extractPcs(data?.raw_meta?.pieces as string);
  const groundSvc    = groundEvents.length ? [...new Set(groundEvents.map(e => e.source))].join(", ") : null;
  const summaryLat   = data?.raw_meta?.lat as string | undefined;
  const summaryToa   = data?.raw_meta?.toa as string | undefined;
  const summaryProduct = data?.raw_meta?.product as string | undefined;

  // Delay from origin: difference between ATD and ETD if both exist and differ
  const delayFromOrigin = (() => {
    if (!etd || !atd) return null;
    const etdMs = new Date(etd).getTime();
    const atdMs = new Date(atd).getTime();
    if (isNaN(etdMs) || isNaN(atdMs)) return null;
    const diffHrs = (atdMs - etdMs) / 3_600_000;
    if (Math.abs(diffHrs) < 0.25) return null; // ignore tiny diffs
    const sign = diffHrs > 0 ? "+" : "-";
    const abs = Math.abs(diffHrs);
    if (abs < 24) return `${sign}${abs.toFixed(1)}h`;
    return `${sign}${(abs / 24).toFixed(1)}d`;
  })();

  // Customs cleared: prefer canonical e.customs field, fall back to remarks scan
  const customsCleared = (() => {
    const allEvs = data?.events ?? [];
    // 1. Prefer the canonical .customs field set by ground trackers
    const withField = allEvs.find(e => e.customs);
    if (withField) {
      const c = withField.customs!;
      if (/clear|yes|released/i.test(c)) return "Yes";
      if (/hold|no|pending|seized/i.test(c)) return "No";
      return "Pending";
    }
    // 2. Legacy: scan remarks for Hebrew / keywords
    const gev = allEvs.find(e => e.remarks && /customs?:|מכס|יש|אין/i.test(e.remarks));
    if (!gev) return null;
    const val = gev.remarks ?? "";
    if (/clear|approved|released/i.test(val)) return "Yes";
    if (/יש/.test(val) && !/אין/.test(val)) return "Yes";
    if (/אין/.test(val)) return "No";
    if (/no|pending|hold/i.test(val)) return "No";
    return "Pending";
  })();

  const inputStyle: React.CSSProperties = {
    padding: "0.6rem 0.75rem", background: "var(--surface)",
    border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)",
  };

  const latestEvent = data?.events.length 
    ? [...data.events].sort((a, b) => parseEventDate(b).getTime() - parseEventDate(a).getTime())[0]
    : null;

  return (
    <div>
      <style>{`@keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }`}</style>
      <h1 style={{ marginBottom: "0.25rem" }}>AWB Query</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>Live tracking — admin view</p>

      {/* ── Query form ── */}
      <form onSubmit={handleSubmit} style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end", marginBottom: "1.5rem" }}>
        <div>
          <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>Airline</label>
          <select value={airline} onChange={e => setAirline(e.target.value)} style={{ ...inputStyle, minWidth: 155 }}>
            {AIRLINES.map(o => <option key={o.value||"auto"} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>AWB</label>
          <input type="text" value={awb} onChange={e => setAwb(e.target.value)} placeholder="e.g. 02022252834" style={{ ...inputStyle, minWidth: 200 }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>House AWB (optional)</label>
          <input type="text" value={hawb} onChange={e => setHawb(e.target.value)} placeholder="e.g. ISR10050445" style={{ ...inputStyle, minWidth: 160 }} />
        </div>
        <button type="submit" disabled={loading} style={{
          padding: "0.6rem 1.5rem", background: "var(--accent)", color: "white",
          border: "none", borderRadius: 8, fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
        }}>
          {loading ? "Querying…" : "Query"}
        </button>
      </form>
 
      {error && <p style={{ color: "var(--error)", marginBottom: "1rem" }}>{error}</p>}
 
      {/* ── Spinner ── */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: "1.5rem" }}>
          <div style={{ width: 28, height: 28, border: "3px solid rgba(var(--accent-rgb),.2)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <span style={{ marginLeft: "1rem", color: "var(--text-muted)", fontWeight: 500 }}>Executing Live Tracking…</span>
        </div>
      )}
 
      {data && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
 
          {/* ── 0. Milestone Plan ── */}
          <MilestonePlan data={data} />
 
          {/* ── 1. Status summary card ── */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.5rem" }}>
            {/* Top row: route + status + timing — left aligned */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "1.1rem" }}>{data.origin ?? "???"}</span>
                <span style={{ color: "var(--accent)", fontSize: "1.3rem" }}>→</span>
                <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "1.1rem" }}>{data.destination ?? "???"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <StatusBadge code={latestEvent?.status_code} />
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  {latestEvent?.status ?? data.status ?? ""}
                </span>
              </div>
              {(() => {
                const d = data.raw_meta?.durations as { airline?: number; ground?: number } | undefined;
                if (!d) return null;
                return (
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", background: "rgba(0,0,0,0.06)", padding: "4px 10px", borderRadius: 6 }}>
                    ⏱ Airline: <strong>{d.airline}s</strong>
                    {(d.ground ?? 0) > 0 && <span> | Ground: <strong>{d.ground}s</strong></span>}
                  </div>
                );
              })()}
            </div>

            {/* Metrics grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: "0.75rem" }}>
              {/* Plain scalar fields */}
              {([
                ["AWB", data.awb],
                ["HAWB", data.hawb ?? "—"],
                ["Airline", data.airline],
                groundSvc ? ["Ground Svc", groundSvc] : null,
                summaryProduct ? ["Product", summaryProduct] : null,
                ["Pieces", maxPcs ? String(maxPcs) : "—"],
                ["Weight", maxWeight ? `${maxWeight} kg` : "—"],
                summaryLat ? ["LAT", summaryLat] : null,
                summaryToa ? ["TOA", summaryToa] : null,
              ] as ([string, string] | null)[]).filter((x): x is [string, string] => x !== null).map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "2px" }}>{label}</div>
                  <div style={{ fontFamily: "monospace", fontWeight: 600, fontSize: "0.9rem" }}>{val}</div>
                </div>
              ))}

              {/* ETD / ATD paired */}
              <div>
                <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "4px" }}>ETD / ATD</div>
                <SummaryDatePair estimatedLabel="ETD" estimated={etd} actualLabel="ATD" actual={atd} />
              </div>

              {/* ETA / ATA paired */}
              <div>
                <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "4px" }}>ETA / ATA</div>
                <SummaryDatePair estimatedLabel="ETA" estimated={eta} actualLabel="ATA" actual={ata} />
              </div>

              {/* Delay from origin */}
              {(delayFromOrigin || atd) && (
                <div>
                  <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "2px" }}>Delay from Origin</div>
                  <div style={{
                    fontFamily: "monospace", fontWeight: 700, fontSize: "0.9rem",
                    color: !delayFromOrigin ? "#2e7d32" : delayFromOrigin.startsWith("+") ? "#b45309" : "#2e7d32",
                  }}>
                    {delayFromOrigin ?? "On time"}
                  </div>
                </div>
              )}

              {/* Customs Cleared */}
              {customsCleared && (
                <div>
                  <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "2px" }}>Customs Cleared</div>
                  <div style={{
                    fontFamily: "monospace", fontWeight: 700, fontSize: "0.9rem",
                    color: customsCleared === "Yes" ? "#2e7d32" : customsCleared === "No" ? "#b71c1c" : "#b45309",
                  }}>
                    {customsCleared === "Yes" ? "✓ Yes" : customsCleared === "No" ? "✗ No" : "⏳ Pending"}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── 2. Anomaly alerts ── */}
          {anomalies.length > 0 && (
            <div>
              {anomalies.map((a, i) => <AnomalyCard key={i} a={a} />)}
            </div>
          )}

          {/* ── 3. Unified event timeline ── */}
          <EventTimelineTable events={data.events} airline={data.airline} />

          {/* ── Footer: message ── */}
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>{data.message}</p>
        </div>
      )}
    </div>
  );
}
