import { useEffect, useState } from "react";
import { fetchAttentionAwbs, type AttentionAwb } from "../lib/api";

function reasonLabel(r: AttentionAwb["reasons"][number]): string {
  if (r === "stale_24h") return "No update 24h+";
  if (r === "special_treatment") return "On ground — special";
  return r;
}

export default function CustomerAwbs() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<AttentionAwb[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const awbs = await fetchAttentionAwbs();
        if (!cancelled) setRows(awbs);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load AWBs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h1 style={{ marginBottom: "0.25rem" }}>AWBs</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>
        <strong>Default view:</strong> shipments that need attention — no meaningful update for 24+ hours, or on-ground
        with special treatment (per your tenant data).
      </p>

      {loading && <p style={{ color: "var(--text-muted)" }}>Loading…</p>}
      {error && <p style={{ color: "var(--error)", marginBottom: "1rem" }}>{error}</p>}

      {!loading && !error && rows.length === 0 && (
        <div
          style={{
            padding: "2rem",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            color: "var(--text-muted)",
          }}
        >
          No AWBs need attention right now. When your tenant has active shipments in the tracking queue that are stale
          or flagged for special handling, they will appear here.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "var(--surface)", textAlign: "left" }}>
                <th style={{ padding: "0.65rem 0.75rem", color: "var(--text-muted)" }}>MAWB</th>
                <th style={{ padding: "0.65rem 0.75rem", color: "var(--text-muted)" }}>HAWB</th>
                <th style={{ padding: "0.65rem 0.75rem", color: "var(--text-muted)" }}>Status</th>
                <th style={{ padding: "0.65rem 0.75rem", color: "var(--text-muted)" }}>Last update</th>
                <th style={{ padding: "0.65rem 0.75rem", color: "var(--text-muted)" }}>Attention</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.awb_id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.65rem 0.75rem", fontFamily: "monospace" }}>{r.mawb}</td>
                  <td style={{ padding: "0.65rem 0.75rem", fontFamily: "monospace" }}>{r.hawb ?? "—"}</td>
                  <td style={{ padding: "0.65rem 0.75rem" }}>{r.latest_status ?? "—"}</td>
                  <td style={{ padding: "0.65rem 0.75rem", whiteSpace: "nowrap" }}>
                    {r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}
                  </td>
                  <td style={{ padding: "0.65rem 0.75rem" }}>
                    {r.reasons.map((x) => (
                      <span
                        key={x}
                        style={{
                          display: "inline-block",
                          marginRight: 6,
                          marginBottom: 4,
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          background:
                            x === "stale_24h" ? "rgba(230, 81, 0, 0.15)" : "rgba(25, 118, 210, 0.15)",
                          color: x === "stale_24h" ? "#e65100" : "#1565c0",
                        }}
                      >
                        {reasonLabel(x)}
                      </span>
                    ))}
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
