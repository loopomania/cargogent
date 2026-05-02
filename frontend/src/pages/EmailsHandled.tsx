import { useState, useEffect } from "react";
import { fetchIngestBatches, type BatchLog } from "../lib/api";

export default function EmailsHandled() {
  const [batches, setBatches] = useState<BatchLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchBatches() {
      try {
        const res = await fetchIngestBatches();
        setBatches(res.batches || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load ingest logs");
      } finally {
        setLoading(false);
      }
    }
    fetchBatches();
  }, []);

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "0.85rem 1rem",
    borderBottom: "2px solid var(--border)",
    color: "var(--text-muted)",
    fontSize: "0.85rem",
    whiteSpace: "nowrap",
  };

  const tdStyle: React.CSSProperties = {
    padding: "0.85rem 1rem",
    borderBottom: "1px solid var(--border)",
    color: "var(--text)",
    fontSize: "0.9rem",
  };

  return (
    <div>
      <style>{`@keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }`}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ marginBottom: "0.25rem" }}>Emails Handled</h1>
          <p style={{ color: "var(--text-muted)", margin: 0 }}>Review incoming ingest logs</p>
        </div>
      </div>

      {error && (
        <div style={{ padding: "1rem", background: "rgba(211,47,47,0.1)", border: "1px solid #d32f2f", borderRadius: 8, color: "#d32f2f", marginBottom: "1.5rem" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "4rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
          <div style={{ width: 28, height: 28, border: "3px solid rgba(var(--accent-rgb),.2)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <span style={{ marginLeft: "1rem", color: "var(--text-muted)", fontWeight: 500 }}>Loading ingest logs…</span>
        </div>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Date & Time</th>
                  <th style={thStyle}>Sender Domain</th>
                  <th style={thStyle}>Email Source</th>
                  <th style={thStyle}>Shipments Ingested</th>
                </tr>
              </thead>
              <tbody>
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--text-muted)" }}>
                      No emails processed recently.
                    </td>
                  </tr>
                ) : (
                  batches.map(b => {
                    const domain = b.sender_email ? b.sender_email.split('@')[1] : "Unknown";
                    const count = parseInt(b.shipments_count, 10);
                    return (
                      <tr key={b.id} style={{ background: "var(--surface)" }}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600 }}>{new Date(b.ingested_at).toLocaleDateString()}</div>
                          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: 2 }}>
                            {new Date(b.ingested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ 
                            background: "rgba(var(--accent-rgb), 0.1)", 
                            color: "var(--accent)", 
                            padding: "0.2rem 0.6rem", 
                            borderRadius: 12, 
                            fontSize: "0.8rem", 
                            fontWeight: 600 
                          }}>
                            {domain}
                          </span>
                        </td>
                        <td style={tdStyle}>{b.sender_email || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Not Recorded</span>}</td>
                        <td style={tdStyle}>
                          <div style={{ 
                            display: "inline-flex", 
                            alignItems: "center", 
                            justifyContent: "center",
                            background: count > 0 ? "rgba(22, 163, 74, 0.1)" : "rgba(234, 179, 8, 0.1)",
                            color: count > 0 ? "#16a34a" : "#ca8a04",
                            padding: "0.25rem 0.75rem",
                            borderRadius: 6,
                            fontWeight: 700
                          }}>
                            {count} {count === 1 ? 'AWB' : 'AWBs'}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
