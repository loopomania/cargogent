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

function parseEventDate(ev: TrackingEvent): Date {
  // Priority: date > departure_date > arrival_date > reception_date > release_date
  const raw =
    ev.date ||
    ev.departure_date ||
    ev.arrival_date ||
    ev.reception_date ||
    ev.release_date ||
    "";
  if (!raw) return new Date(0);

  // "12/02/26 03:28" → dd/mm/yy hh:mm
  const ddmmyy = raw.match(/^(\d{2})\/(\d{2})\/(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (ddmmyy) {
    const [, dd, mm, yy, hh = "00", mi = "00"] = ddmmyy;
    return new Date(`20${yy}-${mm}-${dd}T${hh}:${mi}:00`);
  }
  // "11 FEB 09:42"
  const ddmon = raw.match(/^(\d{1,2})\s+([A-Z]{3})(?:\s+(\d{2}:\d{2}))?/i);
  if (ddmon) {
    const months: Record<string, string> = {
      JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
      JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
    };
    const m = months[ddmon[2].toUpperCase()] ?? "01";
    const time = ddmon[3] ?? "00:00";
    const year = new Date().getFullYear();
    return new Date(`${year}-${m}-${ddmon[1].padStart(2, "0")}T${time}:00`);
  }
  return new Date(0);
}

function extractKg(s?: string | null): number | null {
  if (!s) return null;
  const m = s.match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

function extractPcs(s?: string | null): number | null {
  if (!s) return null;
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

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

function StatusBadge({ code }: { code?: string | null }) {
  if (!code) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  const good = ["DLV", "ARR", "RCF"].includes(code);
  const bad  = ["OFL", "DIS", "DOW"].includes(code);
  const bg = good ? "rgba(46,125,50,0.15)" : bad ? "rgba(211,47,47,0.12)" : "rgba(var(--accent-rgb),0.1)";
  const color = good ? "#2e7d32" : bad ? "#b71c1c" : "var(--accent)";
  return (
    <span style={{ background: bg, color, padding: "3px 10px", borderRadius: 6, fontWeight: 700, fontSize: "0.85rem", fontFamily: "monospace" }}>
      {code}
    </span>
  );
}

function Cell({ children, noWrap }: { children: React.ReactNode; noWrap?: boolean }) {
  return (
    <td style={{ padding: "0.55rem 0.7rem", borderBottom: "1px solid var(--border)", whiteSpace: noWrap ? "nowrap" : undefined }}>
      {children ?? "—"}
    </td>
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
  const [sortDesc, setSortDesc] = useState(true); // newest first

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

  // Merged + sorted events
  const sortedEvents = data
    ? [...data.events].sort((a, b) => {
        const d = parseEventDate(a).getTime() - parseEventDate(b).getTime();
        return sortDesc ? -d : d;
      })
    : [];

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

  // Conditional columns
  const has = (f: keyof TrackingEvent) => sortedEvents.some(e => e[f]);

  const inputStyle: React.CSSProperties = {
    padding: "0.6rem 0.75rem", background: "var(--surface)",
    border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)",
  };

  const thStyle: React.CSSProperties = {
    textAlign: "left", padding: "0.55rem 0.7rem",
    borderBottom: "2px solid var(--border)", color: "var(--text-muted)",
    fontSize: "0.78rem", fontWeight: 600, whiteSpace: "nowrap",
  };

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
            {/* Top row: route + status + timing */}
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "1.1rem" }}>{data.origin ?? "???"}</span>
                <span style={{ color: "var(--accent)", fontSize: "1.3rem" }}>→</span>
                <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "1.1rem" }}>{data.destination ?? "???"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <StatusBadge code={data.events.length ? sortedEvents[0]?.status_code : undefined} />
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  {sortedEvents[0]?.status ?? data.status ?? ""}
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))", gap: "0.75rem" }}>
              {([
                ["AWB", data.awb],
                ["HAWB", data.hawb ?? "—"],
                ["Airline", data.airline],
                groundSvc ? ["Ground Svc", groundSvc] : null,
                summaryProduct ? ["Product", summaryProduct] : null,
                ["Pieces", maxPcs ? String(maxPcs) : "—"],
                ["Weight", maxWeight ? `${maxWeight} kg` : "—"],
                ["ETD", etd ?? "—"],
                ["ATD", atd ?? "—"],
                ["ETA", eta ?? "—"],
                ["ATA", ata ?? "—"],
                summaryLat ? ["LAT", summaryLat] : null,
                summaryToa ? ["TOA", summaryToa] : null,
              ] as ([string, string] | null)[]).filter((x): x is [string, string] => x !== null).map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "2px" }}>{label}</div>
                  <div style={{ fontFamily: "monospace", fontWeight: 600, fontSize: "0.9rem" }}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── 2. Anomaly alerts ── */}
          {anomalies.length > 0 && (
            <div>
              {anomalies.map((a, i) => <AnomalyCard key={i} a={a} />)}
            </div>
          )}

          {/* ── 3. Unified event timeline ── */}
          {sortedEvents.length > 0 && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  {sortedEvents.length} events · ground + airline merged
                </span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Reported By</th>
                      <th style={thStyle}>Location</th>
                      <th style={thStyle}>Code</th>
                      <th style={thStyle}>Status</th>
                      {has("location") && <th style={thStyle}>Airport</th>}
                      <th
                        style={{ ...thStyle, cursor: "pointer", userSelect: "none" }}
                        onClick={() => setSortDesc(d => !d)}
                        title="Click to flip sort order"
                      >
                        Date {sortDesc ? "▼" : "▲"}
                      </th>
                      {has("flight") && <th style={thStyle}>Flight</th>}
                      {has("pieces") && <th style={thStyle}>Pcs</th>}
                      {has("weight") && <th style={thStyle}>Weight</th>}
                      {has("departure_date") && <th style={thStyle}>ETD / ATD</th>}
                      {has("arrival_date") && <th style={thStyle}>ETA / ATA</th>}
                      {has("reception_date") && <th style={thStyle}>Reception</th>}
                      {has("release_date") && <th style={thStyle}>Release</th>}
                      {has("customs") && <th style={thStyle}>Customs</th>}
                      {has("extended_sm") && <th style={thStyle}>Detail</th>}
                      {has("manifest") && <th style={thStyle}>Manifest</th>}
                      {has("remarks") && <th style={thStyle}>Remarks</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedEvents.map((ev, i) => {
                      const isGround = ev.source !== "air";
                      const inProgress = isGround && ev.status_code !== "DLV";

                      // "Reported By" label
                      const SOURCE_LABELS: Record<string, string> = {
                        swissport: "Swissport IL",
                        maman: "Maman",
                      };
                      const reporterLabel = isGround
                        ? (SOURCE_LABELS[ev.source] ?? ev.source)
                        : (data?.airline ?? "Airline");

                      // "Location" phase badge
                      const phase = ev.status_code === "DLV"
                        ? "Delivered"
                        : ev.status_code === "DEP"
                          ? "Air"
                          : "Ground";
                      const phaseStyle = {
                        Delivered: { bg: "rgba(46,125,50,.15)",       color: "#2e7d32" },
                        Air:       { bg: "rgba(2,119,189,.15)",       color: "#0277bd" },
                        Ground:    { bg: "rgba(var(--accent-rgb),.1)", color: "var(--accent)" },
                      }[phase];

                      // Piece display with mismatch highlight
                      const pcsNum = extractPcs(ev.pieces);
                      const actNum = extractPcs(ev.actual_pieces);
                      const pcsMismatch = pcsNum && actNum && pcsNum !== actNum;
                      const pcsColor = pcsMismatch ? (actNum < pcsNum ? "#b71c1c" : "#2e7d32") : "var(--text)";
                      const pcsDisplay = ev.actual_pieces && ev.actual_pieces !== ev.pieces
                        ? `${ev.actual_pieces} / ${ev.pieces}`
                        : (ev.pieces ?? "—");

                      return (
                        <tr key={i} style={{
                          background: inProgress
                            ? "rgba(255,152,0,0.07)"
                            : isGround
                              ? "rgba(var(--accent-rgb),0.04)"
                              : "transparent",
                          boxShadow: inProgress ? "inset 3px 0 0 #ff9800" : isGround ? "inset 3px 0 0 var(--accent)" : "none",
                        }}>
                          {/* Reported By */}
                          <Cell>
                            <span style={{
                              fontSize: "0.72rem",
                              padding: "2px 8px", borderRadius: 4, fontWeight: 600,
                              background: isGround
                                ? (inProgress ? "#ff9800" : "var(--accent)")
                                : "var(--border)",
                              color: isGround ? "white" : "var(--text)",
                              whiteSpace: "nowrap",
                            }}>
                              {reporterLabel}
                            </span>
                          </Cell>
                          {/* Location phase */}
                          <Cell>
                            <span style={{
                              fontSize: "0.72rem", fontWeight: 600,
                              padding: "2px 8px", borderRadius: 4,
                              background: phaseStyle.bg, color: phaseStyle.color,
                              whiteSpace: "nowrap",
                            }}>
                              {phase}
                            </span>
                          </Cell>
                          <Cell><StatusBadge code={ev.status_code} /></Cell>
                          <Cell>{ev.status ?? "—"}</Cell>
                          {has("location") && <Cell>{ev.location ?? "—"}</Cell>}
                          <Cell noWrap>{ev.date ?? "—"}</Cell>
                          {has("flight") && <Cell noWrap>{ev.flight ?? "—"}</Cell>}
                          {has("pieces") && (
                            <td style={{ padding: "0.55rem 0.7rem", borderBottom: "1px solid var(--border)" }}>
                              {pcsMismatch ? (
                                <span style={{ fontWeight: 700, color: pcsColor, background: "rgba(0,0,0,0.05)", padding: "2px 6px", borderRadius: 4 }}>
                                  {pcsDisplay}
                                </span>
                              ) : pcsDisplay}
                            </td>
                          )}
                          {has("weight") && <Cell noWrap>{ev.weight ?? "—"}</Cell>}
                          {has("departure_date") && <Cell noWrap>{ev.departure_date ?? "—"}</Cell>}
                          {has("arrival_date") && <Cell noWrap>{ev.arrival_date ?? "—"}</Cell>}
                          {has("reception_date") && <Cell noWrap>{ev.reception_date ?? "—"}</Cell>}
                          {has("release_date") && <Cell noWrap>{ev.release_date ?? "—"}</Cell>}
                          {has("customs") && <Cell>{ev.customs ?? "—"}</Cell>}
                          {has("extended_sm") && <Cell>{ev.extended_sm ?? "—"}</Cell>}
                          {has("manifest") && <Cell>{ev.manifest ?? "—"}</Cell>}
                          {has("remarks") && <Cell>{ev.remarks ?? "—"}</Cell>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Footer: message ── */}
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>{data.message}</p>
        </div>
      )}
    </div>
  );
}
