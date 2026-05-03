import { useEffect, useState } from "react";
import { fetchArchivedAwbs, type CustomerAwb } from "../lib/api";
import AwbDetailPanel, { StatusBadge } from "../components/AwbDetailPanel";

export default function ArchivedShipments() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<CustomerAwb[]>([]);
  const [selectedAwb, setSelectedAwb] = useState<CustomerAwb | null>(null);
  
  // Pagination & Search state
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const limit = 100;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    (async () => {
      try {
        const { data, total: totalCount } = await fetchArchivedAwbs(page, limit, appliedSearch);
        if (!cancelled) {
          setRows(data);
          setTotal(totalCount);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load archived shipments");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [page, appliedSearch]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1); // Reset to first page
    setAppliedSearch(search);
  };

  const totalPages = Math.ceil(total / limit);

  if (selectedAwb) {
    return (
      <div style={{ height: "100%" }}>
        <AwbDetailPanel
          mawb={selectedAwb.mawb}
          hawb={selectedAwb.hawb}
          ata={selectedAwb.ata || selectedAwb.eta}
          onBack={() => setSelectedAwb(null)}
        />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1>Archived Shipments</h1>
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "0.5rem" }}>
          <input 
            type="text" 
            placeholder="Search MAWB or HAWB..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: "0.5rem",
              borderRadius: "4px",
              border: "1px solid var(--border)",
              background: "var(--background)",
              color: "var(--text)"
            }}
          />
          <button 
            type="submit"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "4px",
              border: "none",
              background: "var(--primary)",
              color: "#fff",
              cursor: "pointer",
              fontWeight: "600"
            }}
          >
            Search
          </button>
        </form>
      </div>

      <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1rem" }}>
        Historical record of fully completed or archived shipments.
      </p>

      {error ? (
        <div style={{ color: "var(--error)", padding: "2rem" }}>{error}</div>
      ) : loading ? (
        <div style={{ color: "var(--text-muted)", padding: "2rem" }}>Loading archive data...</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: "1rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-muted)", textAlign: "center" }}>
          No archived shipments found matching your criteria.
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead style={{ background: "var(--surface)" }}>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  <th style={{ padding: "0.9rem 1rem", width: "40px" }}>#</th>
                  <th style={{ padding: "0.9rem 1rem" }}>MAWB</th>
                  <th style={{ padding: "0.9rem 1rem" }}>HAWB</th>
                  <th style={{ padding: "0.9rem 1rem" }}>Status</th>
                  <th style={{ padding: "0.9rem 1rem" }}>ATA</th>
                  <th style={{ padding: "0.9rem 1rem" }}>Last update</th>
                  <th style={{ padding: "0.9rem 1rem", width: "90px", textAlign: "center" }}> </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr
                    key={`${r.mawb}|${r.hawb ?? ""}`}
                    onClick={() => setSelectedAwb(r)}
                    style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", background: "transparent", transition: "background 0.15s" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--border)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ padding: "0.85rem 1rem", color: "var(--text-muted)", fontSize: "0.8rem", textAlign: "center" }}>{(page - 1) * limit + idx + 1}</td>
                    <td style={{ padding: "0.85rem 1rem", fontWeight: 600, fontFamily: "monospace" }}>{r.mawb}</td>
                    <td style={{ padding: "0.85rem 1rem", fontFamily: "monospace", color: "var(--text-muted)" }}>{r.hawb ?? "—"}</td>
                    <td style={{ padding: "0.85rem 1rem" }}>
                      <StatusBadge status={r.status} />
                    </td>
                    <td style={{ padding: "0.85rem 1rem" }}>{r.ata ? new Date(r.ata).toLocaleDateString() : r.eta ? new Date(r.eta).toLocaleDateString() : "—"}</td>
                    <td style={{ padding: "0.85rem 1rem" }}>{r.last_update ? new Date(r.last_update).toLocaleString() : "—"}</td>
                    <td style={{ padding: "0.85rem 1rem", textAlign: "center" }}>
                      <button
                        type="button"
                        aria-label={`View MAWB ${r.mawb} ${r.hawb ?? ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAwb(r);
                        }}
                        style={{
                          padding: "0.35rem 0.65rem",
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          background: "var(--surface)",
                          color: "var(--accent)",
                          fontWeight: 600,
                          cursor: "pointer",
                          fontSize: "0.78rem",
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ padding: "0.5rem 1rem", border: "1px solid var(--border)", background: "var(--surface)", borderRadius: 4, cursor: page === 1 ? "not-allowed" : "pointer", color: "var(--text)" }}
              >
                Previous
              </button>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Page {page} of {totalPages} (Total {total} shipments)
              </span>
              <button 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{ padding: "0.5rem 1rem", border: "1px solid var(--border)", background: "var(--surface)", borderRadius: 4, cursor: page === totalPages ? "not-allowed" : "pointer", color: "var(--text)" }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
