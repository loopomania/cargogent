import { useState } from "react";
import { type TrackingEvent } from "../lib/api";

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function parseEventDate(ev: TrackingEvent): Date {
  const raw = (
    ev.date ||
    ev.departure_date ||
    ev.arrival_date ||
    ev.reception_date ||
    ev.release_date ||
    ""
  ).trim();
  if (!raw) return new Date(0);

  // If the backend has normalized it, it's a valid ISO string. Let the JS engine parse it natively to preserve Timezones (Z).
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d;

  // --- Legacy Fallbacks (just in case) ---

  // DD/MM/YY HH:MM (Delta, Lufthansa, etc.)
  const ddmmyy = raw.match(/^(\d{2})\/(\d{2})\/(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (ddmmyy) {
    const [, dd, mm, yy, hh = "00", mi = "00"] = ddmmyy;
    return new Date(`20${yy}-${mm}-${dd}T${hh}:${mi}:00`);
  }

  // DD MON HH:MM
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

export function extractPcs(s?: string | null): number | null {
  if (!s) return null;
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export function extractKg(s?: string | null): number | null {
  if (!s) return null;
  const m = s.match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DatePair({
  estimatedLabel, estimated,
  actualLabel, actual,
}: {
  estimatedLabel: string; estimated?: string | null;
  actualLabel: string;   actual?: string | null;
}) {
  const hasEst = !!estimated;
  const hasAct = !!actual;

  // Normalise for comparison (strip seconds / extra whitespace)
  const norm = (s?: string | null) => (s ?? "").trim().replace(/:\d{2}$/, "");
  const same = hasEst && hasAct && norm(estimated) === norm(actual);

  if (!hasEst && !hasAct) return <span style={{ color: "var(--text-muted)" }}>—</span>;

  // If only one value exists — no comparison possible, show muted/green
  if (!hasEst && hasAct) {
    return <span style={{ color: "#2e7d32", fontFamily: "monospace", fontWeight: 600, fontSize: "0.82rem" }}>{actual}</span>;
  }
  if (hasEst && !hasAct) {
    return <span style={{ color: "var(--text-muted)", fontFamily: "monospace", fontSize: "0.82rem" }}>{estimated}</span>;
  }

  if (same) {
    // Green: estimated === actual
    return (
      <span style={{ color: "#2e7d32", fontFamily: "monospace", fontWeight: 600, fontSize: "0.82rem" }}>
        {estimated}
      </span>
    );
  }

  // Yellow: both exist and differ
  const YELLOW = "#b45309";
  const YELLOW_BG = "rgba(245,158,11,0.08)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, background: YELLOW_BG, borderRadius: 4, padding: "2px 4px" }}>
      <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: YELLOW }}>
        <span style={{ opacity: 0.7, fontSize: "0.68rem", marginRight: 3 }}>{estimatedLabel}</span>
        {estimated}
      </span>
      <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: YELLOW }}>
        <span style={{ opacity: 0.7, fontSize: "0.68rem", marginRight: 3 }}>{actualLabel}</span>
        {actual}
      </span>
    </div>
  );
}

export function StatusBadge({ code }: { code?: string | null }) {
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EventTimelineTable({
  events,
  airline,
}: {
  events: TrackingEvent[];
  airline?: string;
}) {
  const [sortDesc, setSortDesc] = useState(true);

  if (!events || events.length === 0) return null;

  // Merged + sorted events
  const sortedEvents = [...events].sort((a, b) => {
    const d = parseEventDate(a).getTime() - parseEventDate(b).getTime();
    return sortDesc ? -d : d;
  });

  const has = (f: keyof TrackingEvent) => sortedEvents.some(e => e[f]);

  const thStyle: React.CSSProperties = {
    textAlign: "left", padding: "0.55rem 0.7rem",
    borderBottom: "2px solid var(--border)", color: "var(--text-muted)",
    fontSize: "0.78rem", fontWeight: 600, whiteSpace: "nowrap",
  };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Raw Data Events</h3>
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
                : (airline ?? "Airline");

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
                  {has("location") && <Cell>{(ev.location ? ev.location.replace(/\s*\([^)]*\)/g, "").trim().toUpperCase() : null) ?? "—"}</Cell>}
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
                  {has("departure_date") && (
                    <td style={{ padding: "0.45rem 0.7rem", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                      <DatePair estimatedLabel="ETD" estimated={ev.departure_date} actualLabel="ATD" actual={ev.date && ev.status_code === "DEP" ? ev.date : null} />
                    </td>
                  )}
                  {has("arrival_date") && (
                    <td style={{ padding: "0.45rem 0.7rem", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                      <DatePair estimatedLabel="ETA" estimated={ev.arrival_date} actualLabel="ATA" actual={ev.date && ev.status_code === "ARR" ? ev.date : null} />
                    </td>
                  )}
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
  );
}
