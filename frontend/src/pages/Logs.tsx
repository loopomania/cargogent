import { useState, useEffect, useCallback } from "react";
import { fetchLogs, type QueryLog } from "../lib/api";

const LIMIT = 1000;

function formatDuration(ms?: number): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function statusColor(status?: string): string {
  if (!status) return "var(--text-muted)";
  const s = status.toLowerCase();
  if (s.includes("error") || s.includes("block")) return "#e65100";
  if (s.includes("dlv") || s.includes("success") || s.includes("ok")) return "#2e7d32";
  return "var(--text)";
}

export default function QueryLogs() {
  const [logs, setLogs] = useState<QueryLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchLogs(p, LIMIT);
      setLogs(res.logs);
      setTotal(res.total);
      setPage(res.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div>
      <h1 style={{ marginBottom: "0.25rem" }}>Query Logs</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>
        All tracking query requests. Showing up to {LIMIT.toLocaleString()} entries per page.
      </p>

      {error && <p style={{ color: "var(--error)", marginBottom: "1rem" }}>{error}</p>}

      {/* Totals + Pagination */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
        <span>Total: <strong style={{ color: "var(--text)" }}>{total.toLocaleString()}</strong> queries</span>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            disabled={page <= 1 || loading}
            onClick={() => load(page - 1)}
            style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.5 : 1 }}
          >← Prev</button>
          <span>Page <strong>{page}</strong> / {totalPages}</span>
          <button
            disabled={page >= totalPages || loading}
            onClick={() => load(page + 1)}
            style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: page >= totalPages ? "not-allowed" : "pointer", opacity: page >= totalPages ? 0.5 : 1 }}
          >Next →</button>
          <button
            onClick={() => load(page)}
            disabled={loading}
            style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--accent)", cursor: "pointer" }}
          >↻ Refresh</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>Loading logs…</div>
      ) : (
        <div style={{ overflowX: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr>
                {["Time", "User", "AWB", "HAWB", "Airline", "Status", "Duration"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "0.6rem 0.75rem", borderBottom: "1px solid var(--border)", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>No logs found.</td>
                </tr>
              ) : logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.55rem 0.75rem", whiteSpace: "nowrap", color: "var(--text-muted)", fontSize: "0.78rem" }}>{formatDate(log.created_at)}</td>
                  <td style={{ padding: "0.55rem 0.75rem" }}>{log.user_name ?? "—"}</td>
                  <td style={{ padding: "0.55rem 0.75rem", fontFamily: "monospace" }}>{log.awb}</td>
                  <td style={{ padding: "0.55rem 0.75rem", fontFamily: "monospace" }}>{log.hawb ?? "—"}</td>
                  <td style={{ padding: "0.55rem 0.75rem" }}>{log.airline_code ?? "—"}</td>
                  <td style={{ padding: "0.55rem 0.75rem" }}>
                    <span style={{ color: statusColor(log.status), fontWeight: 600, fontSize: "0.78rem" }}>
                      {log.status ?? "—"}
                    </span>
                  </td>
                  <td style={{ padding: "0.55rem 0.75rem", whiteSpace: "nowrap" }}>{formatDuration(log.duration_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
