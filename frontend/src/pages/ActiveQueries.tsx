import { useEffect, useState } from "react";
import { fetchActiveQueries, type ActiveQuery, fetchWorkerStatus, type WorkerStatus } from "../lib/api";

export default function ActiveQueries() {
  const [items, setItems] = useState<ActiveQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null);

  const loadList = async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await fetchActiveQueries());
    } catch (err: any) {
      setError(err.message || "Failed to load active queries");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();

    const pollStatus = async () => {
      try {
        setWorkerStatus(await fetchWorkerStatus());
      } catch (err) {
        // ignore polling errors
      }
    };
    pollStatus();
    const intervalId = setInterval(pollStatus, 3000);
    
    return () => clearInterval(intervalId);
  }, []);

  return (
    <div>
      <style>{`
        @keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        .awb-row:hover { background: var(--border) !important; }
        .awb-row { transition: background 0.15s; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ marginBottom: "0.25rem" }}>Active Queries</h1>
          <p style={{ color: "var(--text-muted)", margin: 0 }}>
            Monitor shipments currently being actively queried.
          </p>
        </div>
        
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          {workerStatus && (
            <div style={{
              display: "flex", gap: "1.5rem", padding: "0.5rem 1.25rem",
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, fontSize: "0.85rem"
            }}>
              <div>
                 <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Running</span>
                 <div style={{ fontWeight: 600, color: workerStatus.active > 0 ? "var(--success)" : "var(--text)", display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.15rem" }}>
                    {workerStatus.active > 0 && <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--success)" }} />}
                    {workerStatus.active} <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>/ 5</span>
                 </div>
              </div>
              <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: "1.5rem" }}>
                 <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Queued</span>
                 <div style={{ fontWeight: 600, marginTop: "0.15rem" }}>{workerStatus.queued}</div>
              </div>
            </div>
          )}

          <button
            onClick={loadList}
          style={{
            padding: "0.5rem 1rem",
            background: "var(--surface)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          ↻ Reload List
        </button>
        </div>
      </div>

      {error && <p style={{ color: "var(--error)" }}>{error}</p>}

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading active queries…</p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>
          No active queries at the moment.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: "0.85rem",
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--border)",
                  textAlign: "left",
                  fontSize: "0.78rem",
                  color: "var(--text-muted)",
                }}
              >
                <th style={{ padding: "0.9rem 1rem" }}>Customer</th>
                <th style={{ padding: "0.9rem 1rem" }}>MAWB</th>
                <th style={{ padding: "0.9rem 1rem" }}>HAWB</th>
                <th style={{ padding: "0.9rem 1rem" }}>Last Query Date</th>
                <th style={{ padding: "0.9rem 1rem" }}>Active Time</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr
                  key={idx}
                  className="awb-row"
                  style={{
                    borderBottom: "1px solid var(--border)",
                    background: "transparent",
                  }}
                >
                  <td style={{ padding: "0.85rem 1rem", fontWeight: 600 }}>
                    {it.customer || "—"}
                  </td>
                  <td style={{ padding: "0.85rem 1rem", fontWeight: 600, fontFamily: "monospace" }}>
                    {it.mawb || "—"}
                  </td>
                  <td style={{ padding: "0.85rem 1rem", fontFamily: "monospace", color: "var(--text-muted)" }}>
                    {it.hawb || "—"}
                  </td>
                  <td style={{ padding: "0.85rem 1rem", fontFamily: "monospace", fontSize: "0.82rem" }}>
                    {it.last_query_date ? new Date(it.last_query_date).toLocaleString() : "—"}
                  </td>
                  <td style={{ padding: "0.85rem 1rem", color: "var(--accent)", fontFamily: "monospace", fontSize: "0.82rem", fontWeight: 600 }}>
                    {it.active_time_days !== null && it.active_time_days !== undefined
                      ? `${Math.max(0, it.active_time_days).toFixed(1)} days`
                      : "0.0 days"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
