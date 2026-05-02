import { useEffect, useState } from "react";
import { fetchAttentionAwbs, fetchOpenAwbs, markDeliveredTrackedAwb, markArchivedTrackedAwb, type CustomerAwb } from "../lib/api";
import AwbDetailPanel, { StatusBadge } from "../components/AwbDetailPanel";

export default function ActiveShipments() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attentionRows, setAttentionRows] = useState<CustomerAwb[]>([]);
  const [openRows, setOpenRows] = useState<CustomerAwb[]>([]);

  const [selectedAwb, setSelectedAwb] = useState<CustomerAwb | null>(null);
  const [acting, setActing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [att, op] = await Promise.all([
          fetchAttentionAwbs(),
          fetchOpenAwbs()
        ]);
        if (!cancelled) {
          setAttentionRows(att);
          setOpenRows(op);
        }
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

  const handleAction = async (e: React.MouseEvent, mawb: string, hawb: string | null, action: "delivered" | "archive") => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to mark this shipment as ${action}? It will be removed from the active schedule.`)) return;
    
    const h = hawb || mawb.replace(/-/g, "");
    const key = `${mawb}|${h}|${action}`;
    setActing(prev => ({ ...prev, [key]: true }));

    try {
      if (action === "delivered") {
        await markDeliveredTrackedAwb(mawb, h);
      } else {
        await markArchivedTrackedAwb(mawb, h);
      }
      
      setAttentionRows(prev => prev.filter(r => !(r.mawb === mawb && r.hawb === hawb)));
      setOpenRows(prev => prev.filter(r => !(r.mawb === mawb && r.hawb === hawb)));
      
    } catch (e) {
      alert("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActing(prev => { const n = { ...prev }; delete n[key]; return n; });
    }
  };

  if (selectedAwb) {
    return (
      <div style={{ height: "100%" }}>
        <AwbDetailPanel
          mawb={selectedAwb.mawb}
          hawb={selectedAwb.hawb}
          ata={null} // We don't have ATA exposed directly on ActiveShipments
          onBack={() => setSelectedAwb(null)}
        />
      </div>
    );
  }

  if (loading) return <div style={{ color: "var(--text-muted)", padding: "2rem" }}>Loading shipments...</div>;
  if (error) return <div style={{ color: "var(--error)", padding: "2rem" }}>{error}</div>;

  const renderTable = (rows: CustomerAwb[], isAttention: boolean) => (
    <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, marginBottom: "2rem" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", background: "var(--surface)" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", fontSize: "0.78rem", color: "var(--text-muted)" }}>
            <th style={{ padding: "0.9rem 1rem", width: "40px" }}>#</th>
            <th style={{ padding: "0.9rem 1rem" }}>MAWB</th>
            <th style={{ padding: "0.9rem 1rem" }}>HAWB</th>
            <th style={{ padding: "0.9rem 1rem" }}>Status</th>
            <th style={{ padding: "0.9rem 1rem" }}>ETA</th>
            <th style={{ padding: "0.9rem 1rem" }}>Last update</th>
            {isAttention && <th style={{ padding: "0.9rem 1rem" }}>Issue</th>}
            <th style={{ padding: "0.9rem 1rem" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const h = r.hawb || r.mawb.replace(/-/g, "");
            const isDelivering = acting[`${r.mawb}|${h}|delivered`];
            const isArchiving = acting[`${r.mawb}|${h}|archive`];
            const isActing = isDelivering || isArchiving;

            return (
              <tr 
                key={r.awb_id} 
                onClick={() => setSelectedAwb(r)}
                style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", background: "transparent", transition: "background 0.15s" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--border)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                <td style={{ padding: "0.85rem 1rem", color: "var(--text-muted)", fontSize: "0.8rem", textAlign: "center" }}>{idx + 1}</td>
                <td style={{ padding: "0.85rem 1rem", fontWeight: 600, fontFamily: "monospace" }}>{r.mawb}</td>
                <td style={{ padding: "0.85rem 1rem", fontFamily: "monospace", color: "var(--text-muted)" }}>{r.hawb ?? "—"}</td>
                <td style={{ padding: "0.85rem 1rem" }}><StatusBadge status={r.status} /></td>
                <td style={{ padding: "0.85rem 1rem" }}>{r.eta ? new Date(r.eta).toLocaleDateString() : "—"}</td>
                <td style={{ padding: "0.85rem 1rem" }}>{r.last_update ? new Date(r.last_update).toLocaleString() : "—"}</td>
                {isAttention && (
                  <td style={{ padding: "0.85rem 1rem" }}>
                    {r.reasons.map((issue) => (
                      <span key={issue} style={{ display: "inline-block", background: "rgba(230, 81, 0, 0.1)", color: "#e65100", padding: "2px 8px", borderRadius: 4, fontSize: "0.75rem", fontWeight: 600 }}>
                        {issue}
                      </span>
                    ))}
                  </td>
                )}
                <td style={{ padding: "0.85rem 1rem", display: "flex", gap: "0.5rem" }} onClick={e => e.stopPropagation()}>
                  <button 
                    onClick={(e) => handleAction(e, r.mawb, r.hawb, "delivered")} 
                    disabled={isActing}
                    style={{
                      padding: "0.3rem 0.75rem", fontSize: "0.75rem", fontWeight: 600, whiteSpace: "nowrap",
                      background: "rgba(46,125,50,0.08)", border: "1px solid rgba(46,125,50,0.25)",
                      borderRadius: 6, color: isActing ? "var(--text-muted)" : "#2e7d32",
                      cursor: isActing ? "not-allowed" : "pointer"
                    }}
                  >
                    {isDelivering ? "…" : "✓ Delivered"}
                  </button>
                  <button 
                    onClick={(e) => handleAction(e, r.mawb, r.hawb, "archive")}
                    disabled={isActing}
                    style={{
                      padding: "0.3rem 0.75rem", fontSize: "0.75rem", fontWeight: 600, whiteSpace: "nowrap",
                      background: "rgba(96,125,139,0.08)", border: "1px solid rgba(96,125,139,0.25)",
                      borderRadius: 6, color: isActing ? "var(--text-muted)" : "rgba(84,110,122,0.9)",
                      cursor: isActing ? "not-allowed" : "pointer"
                    }}
                  >
                    {isArchiving ? "…" : "📥 Archive"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>Active Shipments</h1>

      <h2 style={{ fontSize: "1.2rem", marginBottom: "0.5rem", color: "#e65100" }}>Need Attention</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1rem" }}>
        Shipments flagged with issues (e.g., no updates for 24+ hours).
      </p>
      
      {attentionRows.length === 0 ? (
        <div style={{ padding: "1rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-muted)", marginBottom: "2rem" }}>
          No shipments currently need attention.
        </div>
      ) : renderTable(attentionRows, true)}

      <h2 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>Open Shipments</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1rem" }}>
        Active tracking schedule.
      </p>

      {openRows.length === 0 ? (
        <div style={{ padding: "1rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-muted)" }}>
          No open shipments.
        </div>
      ) : renderTable(openRows, false)}
    </div>
  );
}
