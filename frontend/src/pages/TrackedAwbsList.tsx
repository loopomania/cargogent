import { useEffect, useState } from "react";
import {
  fetchTrackedList,
  fetchStoredTracking,
  trackByAwb,
  removeTrackedAwb,
  markDeliveredTrackedAwb,
  type TrackedListItem,
  type TrackingResponse,
} from "../lib/api";
import MilestonePlan from "../components/MilestonePlan";
import EventTimelineTable from "../components/EventTimelineTable";

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  const warn = /partial|ground/i.test(status);
  const good = !warn && /delivered|dlv|cleared/i.test(status);
  const bad = /error|blocked|fail/i.test(status);
  const bg = good
    ? "rgba(46,125,50,0.15)"
    : bad
    ? "rgba(211,47,47,0.12)"
    : warn
    ? "rgba(255,152,0,0.12)"
    : "rgba(var(--accent-rgb),0.1)";
  const color = good
    ? "#2e7d32"
    : bad
    ? "#b71c1c"
    : warn
    ? "#e65100"
    : "var(--accent)";
  return (
    <span
      style={{
        fontSize: "0.73rem",
        padding: "3px 10px",
        borderRadius: 6,
        fontWeight: 600,
        background: bg,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}

// ─── Metric tile ──────────────────────────────────────────────────────────────
function Tile({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "0.9rem" }}>
        {value || "—"}
      </div>
    </div>
  );
}

// ─── Detail panel (full page) ─────────────────────────────────────────────────
function DetailPanel({
  item,
  onBack,
}: {
  item: TrackedListItem;
  onBack: () => void;
}) {
  const [details, setDetails] = useState<TrackingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [source, setSource] = useState<"db" | "live">("db");

  // On mount: load from DB
  useEffect(() => {
    loadFromDb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.mawb, item.hawb]);

  const loadFromDb = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchStoredTracking(item.mawb, item.hawb);
      setDetails(res);
      setSource("db");
      const synced = (res.raw_meta?.last_synced as string) ?? null;
      setLastSynced(synced ? new Date(synced).toLocaleString() : null);
    } catch (err: any) {
      // 404 means no DB data yet — prompt user to Sync
      if (err.message?.includes("No stored data")) {
        setError("No cached data yet. Click 'Sync Now' to run a live query.");
      } else {
        setError(err.message || "Failed to load stored data");
      }
    } finally {
      setLoading(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    setError("");
    const previous = details;
    try {
      const hawbArg = item.hawb !== item.mawb ? item.hawb : undefined;
      const res = await trackByAwb(item.mawb, hawbArg);

      const hasProjection = Boolean(
        res.milestone_projection?.flows_steps?.some((flow) => flow.length > 0),
      );
      const prevHadProjection = Boolean(
        previous?.milestone_projection?.flows_steps?.some((flow) => flow.length > 0),
      );
      const hasTimeline = Boolean(res.events && res.events.length > 0);
      if (!hasTimeline && !hasProjection && previous && ((previous.events?.length ?? 0) > 0 || prevHadProjection)) {
        setError("Live tracker returned no usable events; showing your last cached view.");
        setSource("db");
      } else {
        setDetails(res);
        setSource("live");
        setLastSynced(new Date().toLocaleString());
      }
    } catch (err: any) {
      setError(err.message || "Live query failed");
      if (previous) setDetails(previous);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <style>{`@keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }`}</style>

      {/* ── Header bar ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button
            onClick={onBack}
            style={{
              padding: "0.4rem 0.9rem",
              background: "var(--surface)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: 500,
              fontSize: "0.85rem",
            }}
          >
            ← Back to List
          </button>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "1.05rem" }}>
                {item.mawb}
              </span>
              {item.hawb && item.hawb !== item.mawb && (
                <>
                  <span style={{ color: "var(--text-muted)" }}>·</span>
                  <span style={{ fontFamily: "monospace", fontSize: "0.9rem", color: "var(--text-muted)" }}>
                    {item.hawb}
                  </span>
                </>
              )}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
              {source === "db"
                ? lastSynced
                  ? `Loaded from DB · last synced ${lastSynced}`
                  : "Loaded from DB"
                : `Live query · ${new Date().toLocaleString()}`}
            </div>
          </div>
        </div>

        <button
          onClick={syncNow}
          disabled={syncing || loading}
          style={{
            padding: "0.5rem 1.25rem",
            background: syncing ? "var(--border)" : "var(--accent)",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: syncing || loading ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: "0.85rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            opacity: syncing || loading ? 0.7 : 1,
          }}
        >
          {syncing ? (
            <>
              <div
                style={{
                  width: 14,
                  height: 14,
                  border: "2px solid rgba(255,255,255,.3)",
                  borderTopColor: "white",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }}
              />
              Syncing…
            </>
          ) : (
            <>↻ Sync Now</>
          )}
        </button>
      </div>

      {/* ── Loading state ── */}
      {(loading || syncing) && !details && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "4rem",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            gap: "1rem",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              border: "3px solid rgba(var(--accent-rgb),.2)",
              borderTopColor: "var(--accent)",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>
            {syncing ? "Running live tracker…" : "Loading from database…"}
          </span>
        </div>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <div
          style={{
            padding: "1rem 1.25rem",
            background: "rgba(211,47,47,0.08)",
            border: "1px solid rgba(211,47,47,0.25)",
            borderRadius: 8,
            color: "#b71c1c",
            fontSize: "0.85rem",
            marginBottom: "1rem",
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* ── Details ── */}
      {details && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", flex: 1 }}>

          {/* Milestone plan first (matches AWB Query layout) */}
          {details.events?.length ||
          details.milestone_projection?.flows_steps?.some((flow) => flow.length > 0) ? (
            <MilestonePlan data={details} />
          ) : (
            <div
              style={{
                padding: "2.5rem",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                textAlign: "center",
                color: "var(--text-muted)",
              }}
            >
              No tracking events stored yet. Click <strong>Sync Now</strong> to pull live data.
            </div>
          )}

          {/* Status summary card (matching AWB Query layout) */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "1.25rem 1.5rem",
            }}
          >
            {/* Top row: route + status — left aligned */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "1rem",
                marginBottom: "1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "1.15rem" }}>
                  {details.origin ?? "???"}
                </span>
                <span style={{ color: "var(--accent)", fontSize: "1.4rem" }}>→</span>
                <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "1.15rem" }}>
                  {details.destination ?? "???"}
                </span>
              </div>

              {/* Status badge — derived from events like AWB Query */}
              {(() => {
                const evts = details.events ?? [];
                const isDlv =
                  evts.some(e => e.status_code === "DLV") ||
                  details.status === "Delivered" ||
                  details.status === "Delivered to origin";
                const latestEv = [...evts].sort((a, b) =>
                  new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
                )[0];
                const code = isDlv ? "DLV" : latestEv?.status_code ?? details.status;
                const label = isDlv
                  ? details.status === "Delivered to origin"
                    ? "Delivered to origin"
                    : "Delivered"
                  : latestEv?.status ?? details.status ?? "";
                const isGreen = isDlv;
                const isRed = /error|blocked/i.test(label || "");
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{
                      fontSize: "0.78rem", padding: "3px 10px", borderRadius: 6, fontWeight: 700,
                      background: isGreen ? "rgba(46,125,50,0.15)" : isRed ? "rgba(211,47,47,0.12)" : "rgba(var(--accent-rgb),0.1)",
                      color: isGreen ? "#2e7d32" : isRed ? "#b71c1c" : "var(--accent)",
                    }}>{code}</span>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{label}</span>
                  </div>
                );
              })()}
            </div>

            {/* Metric grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: "0.75rem",
              }}
            >
              <Tile label="MAWB" value={details.awb} />
              <Tile label="HAWB" value={details.hawb} />
              <Tile label="Airline" value={details.airline} />
              {details.flight && <Tile label="Flight" value={details.flight} />}
              {item.ata && <Tile label="ATA" value={item.ata} />}
              {source === "db" && lastSynced && (
                <Tile label="Last Synced" value={lastSynced} />
              )}
            </div>
          </div>

          {/* Trace message */}
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>
            {details.message}
          </p>

          <EventTimelineTable events={details.events} airline={details.airline} />
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TrackedAwbsList() {
  const [items, setItems] = useState<TrackedListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<TrackedListItem | null>(null);
  const [removing, setRemoving] = useState<Record<string, boolean>>({});
  const [confirmTarget, setConfirmTarget] = useState<TrackedListItem | null>(null);

  const loadList = async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await fetchTrackedList());
    } catch (err: any) {
      setError(err.message || "Failed to load tracked list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
  }, []);

  const handleRemove = (e: React.MouseEvent, item: TrackedListItem) => {
    e.stopPropagation();
    setConfirmTarget(item);
  };

  const confirmRemove = async () => {
    if (!confirmTarget) return;
    const item = confirmTarget;
    setConfirmTarget(null);
    const key = `${item.mawb}|${item.hawb}`;
    setRemoving(r => ({ ...r, [key]: true }));
    try {
      await removeTrackedAwb(item.mawb, item.hawb, item.tenant_id);
      setItems(prev => prev.filter(i => !(i.mawb === item.mawb && i.hawb === item.hawb && i.tenant_id === item.tenant_id)));
    } catch (err: any) {
      setError(err.message || "Failed to remove shipment");
    } finally {
      setRemoving(r => { const n = { ...r }; delete n[key]; return n; });
    }
  };

  const [markingDelivered, setMarkingDelivered] = useState<Record<string, boolean>>({});
  const [confirmDeliveredTarget, setConfirmDeliveredTarget] = useState<TrackedListItem | null>(null);

  const handleMarkDelivered = (e: React.MouseEvent, item: TrackedListItem) => {
    e.stopPropagation();
    setConfirmDeliveredTarget(item);
  };

  const confirmMarkDelivered = async () => {
    if (!confirmDeliveredTarget) return;
    const item = confirmDeliveredTarget;
    setConfirmDeliveredTarget(null);
    const key = `${item.mawb}|${item.hawb}`;
    setMarkingDelivered(prev => ({ ...prev, [key]: true }));
    try {
      await markDeliveredTrackedAwb(item.mawb, item.hawb, item.tenant_id);
      setItems(prev => prev.filter(i => !(i.mawb === item.mawb && i.hawb === item.hawb && i.tenant_id === item.tenant_id)));
      if (selected?.mawb === item.mawb && selected?.hawb === item.hawb) {
        setSelected(null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to mark as delivered");
    } finally {
      setMarkingDelivered(prev => { const n = { ...prev }; delete n[key]; return n; });
    }
  };

  // ── Detail panel view ──────────────────────────────────────────────────────
  if (selected) {
    return (
      <div style={{ height: "100%" }}>
        <DetailPanel item={selected} onBack={() => setSelected(null)} />
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div>
      <style>{`
        @keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        .awb-row:hover { background: var(--border) !important; }
        .awb-row { transition: background 0.15s; }
        .confirm-overlay {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,0.55); backdrop-filter: blur(3px);
          display: flex; align-items: center; justify-content: center; z-index: 2000;
        }
        .confirm-box {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 14px; padding: 2rem 2.25rem; max-width: 420px; width: 90%;
          box-shadow: 0 20px 60px rgba(0,0,0,0.4);
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ marginBottom: "0.25rem" }}>AWB Tracked List</h1>
          <p style={{ color: "var(--text-muted)", margin: 0 }}>
            Click any row to view stored tracking data. Use &quot;Sync Now&quot; inside to refresh.
          </p>
        </div>
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

      {error && <p style={{ color: "var(--error)" }}>{error}</p>}

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading tracking schedules…</p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>
          No AWBs tracked yet. Query a shipment in <strong>AWB Query</strong> to add it here.
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
                <th style={{ padding: "0.9rem 1rem" }}>Status</th>
                <th style={{ padding: "0.9rem 1rem" }}>Origin</th>
                <th style={{ padding: "0.9rem 1rem" }}>Dest</th>
                <th style={{ padding: "0.9rem 1rem" }}>ATA</th>
                <th style={{ padding: "0.9rem 1rem" }}>Last Queried</th>
                <th style={{ padding: "0.9rem 1rem" }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr
                  key={idx}
                  className="awb-row"
                  onClick={() => setSelected(it)}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                    background: "transparent",
                  }}
                >
                  <td style={{ padding: "0.85rem 1rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {it.domain_name || "—"}
                  </td>
                  <td style={{ padding: "0.85rem 1rem", fontWeight: 600, fontFamily: "monospace" }}>
                    {it.mawb || "—"}
                  </td>
                  <td style={{ padding: "0.85rem 1rem", fontFamily: "monospace", color: "var(--text-muted)" }}>
                    {it.hawb || "—"}
                  </td>
                  <td style={{ padding: "0.85rem 1rem" }}>
                    <StatusBadge status={it.status} />
                  </td>
                  <td style={{ padding: "0.85rem 1rem" }}>{it.origin || "—"}</td>
                  <td style={{ padding: "0.85rem 1rem" }}>{it.destination || "—"}</td>
                  <td style={{ padding: "0.85rem 1rem", fontFamily: "monospace", fontSize: "0.82rem" }}>
                    {it.ata ? new Date(it.ata).toLocaleString() : "—"}
                  </td>
                  <td style={{ padding: "0.85rem 1rem", color: "var(--accent)", fontFamily: "monospace", fontSize: "0.82rem" }}>
                    {it.last_query_date ? new Date(it.last_query_date).toLocaleString() : "—"}
                  </td>
                  <td style={{ padding: "0.85rem 1rem", display: "flex", gap: "0.5rem" }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={e => handleMarkDelivered(e, it)}
                      disabled={markingDelivered[`${it.mawb}|${it.hawb}`]}
                      title="Mark as Delivered manually"
                      style={{
                        padding: "0.3rem 0.75rem",
                        fontSize: "0.75rem",
                        background: "rgba(46,125,50,0.08)",
                        border: "1px solid rgba(46,125,50,0.25)",
                        borderRadius: 6,
                        color: markingDelivered[`${it.mawb}|${it.hawb}`] ? "var(--text-muted)" : "#2e7d32",
                        cursor: markingDelivered[`${it.mawb}|${it.hawb}`] ? "not-allowed" : "pointer",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {markingDelivered[`${it.mawb}|${it.hawb}`] ? "…" : "✓ Delivered"}
                    </button>
                    <button
                      onClick={e => handleRemove(e, it)}
                      disabled={removing[`${it.mawb}|${it.hawb}`]}
                      title="Remove from tracking system"
                      style={{
                        padding: "0.3rem 0.75rem",
                        fontSize: "0.75rem",
                        background: "rgba(220,38,38,0.08)",
                        border: "1px solid rgba(220,38,38,0.25)",
                        borderRadius: 6,
                        color: removing[`${it.mawb}|${it.hawb}`] ? "var(--text-muted)" : "rgba(220,38,38,0.9)",
                        cursor: removing[`${it.mawb}|${it.hawb}`] ? "not-allowed" : "pointer",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {removing[`${it.mawb}|${it.hawb}`] ? "…" : "✕ Remove"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Custom confirm dialog for Remove ── */}
      {confirmTarget && (
        <div className="confirm-overlay" onClick={() => setConfirmTarget(null)}>
          <div className="confirm-box" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: "1.3rem", marginBottom: "0.75rem" }}>🗑️</div>
            <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Remove from tracking?</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "0 0 0.35rem", lineHeight: 1.5 }}>
              This will permanently delete all stored events and tracking data for:
            </p>
            <div style={{ fontFamily: "monospace", fontSize: "0.82rem", padding: "0.6rem 0.9rem", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 8, marginBottom: "1.5rem" }}>
              <span style={{ fontWeight: 700 }}>{confirmTarget.mawb}</span>
              {confirmTarget.hawb !== confirmTarget.mawb && (
                <span style={{ color: "var(--text-muted)" }}> / {confirmTarget.hawb}</span>
              )}
            </div>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmTarget(null)}
                style={{ padding: "0.5rem 1.25rem", background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", fontWeight: 500, fontSize: "0.85rem" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmRemove}
                style={{ padding: "0.5rem 1.25rem", background: "rgba(220,38,38,0.9)", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: "0.85rem" }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Custom confirm dialog for Delivered ── */}
      {confirmDeliveredTarget && (
        <div className="confirm-overlay" onClick={() => setConfirmDeliveredTarget(null)}>
          <div className="confirm-box" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: "1.3rem", marginBottom: "0.75rem" }}>✅</div>
            <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Mark as Delivered?</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "0 0 0.35rem", lineHeight: 1.5 }}>
              This will manually append a Delivered (DLV) event and remove it from ongoing tracking queries:
            </p>
            <div style={{ fontFamily: "monospace", fontSize: "0.82rem", padding: "0.6rem 0.9rem", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 8, marginBottom: "1.5rem" }}>
              <span style={{ fontWeight: 700 }}>{confirmDeliveredTarget.mawb}</span>
              {confirmDeliveredTarget.hawb !== confirmDeliveredTarget.mawb && (
                <span style={{ color: "var(--text-muted)" }}> / {confirmDeliveredTarget.hawb}</span>
              )}
            </div>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmDeliveredTarget(null)}
                style={{ padding: "0.5rem 1.25rem", background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", fontWeight: 500, fontSize: "0.85rem" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmMarkDelivered}
                style={{ padding: "0.5rem 1.25rem", background: "#2e7d32", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: "0.85rem" }}
              >
                Mark Delivered
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
