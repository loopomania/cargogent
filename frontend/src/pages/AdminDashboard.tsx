import { useState } from "react";
import { trackByAwb, trackByAirline, type TrackingResponse } from "../lib/api";

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
    if (!a) {
      setError("Enter AWB number");
      return;
    }
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

  return (
    <div>
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
      <h1 style={{ marginBottom: "0.25rem" }}>AWB Query</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>
        Query AWB tracking (admin). Results from AWBTrackers via backend.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end", marginBottom: "1.5rem" }}>
        <div>
          <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>Airline</label>
          <select
            value={airline}
            onChange={(e) => setAirline(e.target.value)}
            style={{
              padding: "0.6rem 0.75rem",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--text)",
              minWidth: 160,
            }}
          >
            {AIRLINES.map((o) => (
              <option key={o.value || "auto"} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>AWB</label>
          <input
            type="text"
            value={awb}
            onChange={(e) => setAwb(e.target.value)}
            placeholder="e.g. 11463874650"
            style={{
              padding: "0.6rem 0.75rem",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--text)",
              minWidth: 200,
            }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>House AWB (Optional)</label>
          <input
            type="text"
            value={hawb}
            onChange={(e) => setHawb(e.target.value)}
            placeholder="e.g. 32028278"
            style={{
              padding: "0.6rem 0.75rem",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--text)",
              minWidth: 150,
            }}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "0.6rem 1.5rem",
            background: "var(--accent)",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Querying…" : "Query"}
        </button>
      </form>

      {error && <p style={{ color: "var(--error)", marginBottom: "1rem" }}>{error}</p>}

      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: "1.5rem" }}>
          <div
            style={{
              width: 30,
              height: 30,
              border: "3px solid rgba(var(--accent-rgb), 0.2)",
              borderTopColor: "var(--accent)",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <span style={{ marginLeft: "1rem", color: "var(--text-muted)", fontWeight: 500 }}>
            Executing Live Tracking...
          </span>
        </div>
      )}

      {data && !loading && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Summary</div>
            {(() => {
              const durations = data.raw_meta?.durations as { airline?: number; ground?: number } | undefined;
              if (durations) {
                return (
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", background: "rgba(0,0,0,0.05)", padding: "4px 8px", borderRadius: 6 }}>
                    ⏱ Airline: <strong>{durations.airline}s</strong>
                    {(durations.ground ?? 0) > 0 && <span> | Ground: <strong>{durations.ground}s</strong></span>}
                  </div>
                );
              }
              return null;
            })()}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
            <div><span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Airline</span><div style={{ fontFamily: "monospace" }}>{data.airline}</div></div>
            <div><span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>AWB</span><div style={{ fontFamily: "monospace" }}>{data.awb}</div></div>
            <div><span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Origin</span><div style={{ fontFamily: "monospace" }}>{data.origin ?? "—"}</div></div>
            <div><span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Destination</span><div style={{ fontFamily: "monospace" }}>{data.destination ?? "—"}</div></div>
            <div><span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>HAWB</span><div style={{ fontFamily: "monospace" }}>{data.hawb ?? "—"}</div></div>
            <div><span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Status</span><div style={{ fontFamily: "monospace" }}>{data.status ?? "—"}</div></div>
          </div>
          {data.events.length > 0 && (
            <>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>Events</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "0.6rem 0.75rem", borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>Type</th>
                      <th style={{ textAlign: "left", padding: "0.6rem 0.75rem", borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>Code</th>
                      <th style={{ textAlign: "left", padding: "0.6rem 0.75rem", borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>Location</th>
                      <th style={{ textAlign: "left", padding: "0.6rem 0.75rem", borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>Date</th>
                      <th style={{ textAlign: "left", padding: "0.6rem 0.75rem", borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>Pieces</th>
                      <th style={{ textAlign: "left", padding: "0.6rem 0.75rem", borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.map((ev, i) => (
                      <tr key={i} style={{ background: ev.source === "ground" ? "rgba(var(--accent-rgb), 0.05)" : "transparent" }}>
                        <td style={{ padding: "0.6rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
                          <span style={{
                            fontSize: "0.65rem",
                            textTransform: "uppercase",
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: ev.source === "ground" ? "var(--accent)" : "var(--border)",
                            color: ev.source === "ground" ? "white" : "var(--text)",
                            fontWeight: 600
                          }}>
                            {ev.source ?? "air"}
                          </span>
                        </td>
                        <td style={{ padding: "0.6rem 0.75rem", borderBottom: "1px solid var(--border)" }}>{ev.status_code ?? "—"}</td>
                        <td style={{ padding: "0.6rem 0.75rem", borderBottom: "1px solid var(--border)" }}>{ev.location ?? "—"}</td>
                        <td style={{ padding: "0.6rem 0.75rem", borderBottom: "1px solid var(--border)" }}>{ev.date ?? "—"}</td>
                        <td style={{ padding: "0.6rem 0.75rem", borderBottom: "1px solid var(--border)" }}>{ev.pieces ?? "—"}</td>
                        <td style={{ padding: "0.6rem 0.75rem", borderBottom: "1px solid var(--border)" }}>{ev.remarks ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p style={{ marginTop: "1rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>{data.message}</p>
        </div>
      )}
    </div>
  );
}
