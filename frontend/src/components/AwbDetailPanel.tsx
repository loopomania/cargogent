import { useEffect, useState } from "react";
import { fetchStoredTracking, trackByAwb, type TrackingResponse } from "../lib/api";
import MilestonePlan from "./MilestonePlan";
import EventTimelineTable from "./EventTimelineTable";

export function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  const warn = /partial|ground/i.test(status);
  const good = !warn && /delivered|dlv|cleared|archived/i.test(status);
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

export default function AwbDetailPanel({
  mawb,
  hawb,
  ata,
  onBack,
  disableLiveSync = false,
}: {
  mawb: string;
  hawb: string | null;
  ata?: string | null;
  onBack: () => void;
  disableLiveSync?: boolean; // Archived shipments might not need live sync
}) {
  const [details, setDetails] = useState<TrackingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [source, setSource] = useState<"db" | "live">("db");

  useEffect(() => {
    loadFromDb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mawb, hawb]);

  const loadFromDb = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchStoredTracking(mawb, hawb || undefined);
      setDetails(res);
      setSource("db");
      const synced = (res.raw_meta?.last_synced as string) ?? null;
      setLastSynced(synced ? new Date(synced).toLocaleString() : null);
    } catch (err: any) {
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
      const hawbArg = hawb !== mawb ? hawb : undefined;
      const res = await trackByAwb(mawb, hawbArg || undefined);

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
            ← Back
          </button>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "1.05rem" }}>
                {mawb}
              </span>
              {hawb && hawb !== mawb && (
                <>
                  <span style={{ color: "var(--text-muted)" }}>·</span>
                  <span style={{ fontFamily: "monospace", fontSize: "0.9rem", color: "var(--text-muted)" }}>
                    {hawb}
                  </span>
                </>
              )}
              {Boolean(details?.raw_meta?.pieces) && (
                <>
                  <span style={{ color: "var(--text-muted)" }}>·</span>
                  <span style={{ fontSize: "0.85rem", color: "var(--text)", fontWeight: 500 }}>
                    {String(details?.raw_meta?.pieces)} Pcs
                  </span>
                </>
              )}
              {Boolean(details?.raw_meta?.weight) && (
                <>
                  <span style={{ color: "var(--text-muted)" }}>·</span>
                  <span style={{ fontSize: "0.85rem", color: "var(--text)", fontWeight: 500 }}>
                    {String(details?.raw_meta?.weight)}
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

        {!disableLiveSync && (
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
        )}
      </div>

      {(loading || syncing) && !details && (
        <div style={{ padding: "4rem", textAlign: "center", color: "var(--text-muted)" }}>
          {syncing ? "Running live tracker…" : "Loading from database…"}
        </div>
      )}

      {error && !loading && (
        <div style={{ padding: "1rem", background: "rgba(211,47,47,0.08)", color: "#b71c1c", borderRadius: 8, marginBottom: "1rem" }}>
          ⚠️ {error}
        </div>
      )}

      {details && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", flex: 1 }}>
          {details.events?.length ||
          details.milestone_projection?.flows_steps?.some((flow) => flow.length > 0) ? (
            <MilestonePlan data={details} />
          ) : (
            <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 12 }}>
              No tracking events stored yet.
            </div>
          )}

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.5rem" }}>
            <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", alignItems: "center" }}>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "1.15rem" }}>{details.origin ?? "???"}</span>
                <span style={{ color: "var(--accent)", fontSize: "1.4rem" }}>→</span>
                <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "1.15rem" }}>{details.destination ?? "???"}</span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "0.75rem" }}>
              <Tile label="MAWB" value={details.awb} />
              <Tile label="HAWB" value={details.hawb} />
              <Tile label="Airline" value={details.airline} />
              {details.flight && <Tile label="Flight" value={details.flight} />}
              {ata && <Tile label="ATA" value={ata} />}
              {source === "db" && lastSynced && <Tile label="Last Synced" value={lastSynced} />}
            </div>
          </div>

          <EventTimelineTable events={details.events} airline={details.airline} />
        </div>
      )}
    </div>
  );
}
