import { useState, useEffect, useCallback } from "react";
import {
  fetchServicesStatus,
  fetchCircuitBreakers,
  fetchAwbTrackingStats,
  fetchTrackers,
  type ServiceHealth,
  type ServiceStatus,
  type CircuitBreakerEntry,
  type AwbTrackingStats,
  type TrackerEntry,
} from "../lib/api";

// ─── constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ServiceStatus,
  { label: string; color: string; bg: string }
> = {
  active:    { label: "Active",    color: "#22c55e", bg: "rgba(34,197,94,0.12)"  },
  degraded:  { label: "Degraded",  color: "#eab308", bg: "rgba(234,179,8,0.12)"  },
  offline:   { label: "Offline",   color: "#ef4444", bg: "rgba(239,68,68,0.12)"  },
  suspended: { label: "Suspended", color: "#8b9cb3", bg: "rgba(139,156,179,0.10)" },
};

const CB_CONFIG: Record<
  CircuitBreakerEntry["status"],
  { label: string; color: string; bg: string }
> = {
  closed:   { label: "Closed",   color: "#22c55e", bg: "rgba(34,197,94,0.10)"  },
  degraded: { label: "Degraded", color: "#eab308", bg: "rgba(234,179,8,0.10)"  },
  tripped:  { label: "Tripped",  color: "#ef4444", bg: "rgba(239,68,68,0.10)"  },
};

const SERVICE_ICONS: Record<string, string> = {
  awbtrackers: "🛫",
  postgres:    "🗄️",
  proxy:       "🔄",
  n8n:         "⚡",
  smtp:        "✉️",
  newrelic:    "📊",
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtLatency(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtCountdown(s: number | null): string {
  if (s == null || s <= 0) return "—";
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ─── shared micro-components ──────────────────────────────────────────────────

function PulseDot({ color }: { color: string }) {
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: color, flexShrink: 0,
      animation: "pulse-ring 1.8s infinite",
      boxShadow: `0 0 0 0 ${color}`,
    }} />
  );
}

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: bg, border: `1px solid ${color}44`,
      borderRadius: 20, padding: "2px 10px 2px 7px",
      fontSize: "0.72rem", fontWeight: 700, color, letterSpacing: "0.04em",
      whiteSpace: "nowrap",
    }}>
      <PulseDot color={color} />
      {label}
    </span>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "var(--surface-alt)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "4px 12px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
    }}>
      <span style={{ fontSize: "0.62rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text)", fontFamily: "monospace" }}>{value}</span>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      margin: "2.25rem 0 1rem",
      fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.1em",
      textTransform: "uppercase", color: "var(--text-muted)",
      borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem",
    }}>
      {children}
    </h2>
  );
}

function SkeletonCard() {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 16, padding: "1.5rem", minHeight: 170,
      display: "flex", flexDirection: "column", gap: "0.75rem",
    }}>
      {[80, 50, 60, 40].map((w, i) => (
        <div key={i} style={{
          height: i === 0 ? 18 : 13, width: `${w}%`,
          borderRadius: 8, background: "var(--border)",
          animation: "shimmer 1.4s infinite",
        }} />
      ))}
    </div>
  );
}

// ─── Service Card ─────────────────────────────────────────────────────────────

function ServiceCard({ svc }: { svc: ServiceHealth }) {
  const cfg = STATUS_CONFIG[svc.status] ?? STATUS_CONFIG.offline;
  const icon = SERVICE_ICONS[svc.id] ?? "🔧";

  return (
    <div
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 16, padding: "1.5rem",
        display: "flex", flexDirection: "column", gap: "0.85rem",
        position: "relative", overflow: "hidden",
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = cfg.color + "55";
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 24px ${cfg.color}18`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: cfg.color, opacity: 0.7, borderRadius: "16px 16px 0 0" }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={{ fontSize: "1.35rem" }}>{icon}</span>
          <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{svc.name}</span>
        </div>
        <Badge label={cfg.label} color={cfg.color} bg={cfg.bg} />
      </div>

      <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
        {svc.description}
      </p>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <MetricChip label="Latency" value={fmtLatency(svc.latency_ms)} />
        <MetricChip label="Checked" value={fmtTime(svc.checked_at)} />
      </div>

      {svc.detail && (
        <div style={{
          background: `${cfg.color}10`, border: `1px solid ${cfg.color}33`,
          borderRadius: 8, padding: "6px 10px",
          fontSize: "0.74rem", color: cfg.color, fontFamily: "monospace", wordBreak: "break-word",
        }}>
          {svc.detail}
        </div>
      )}
    </div>
  );
}

// ─── Summary Banner ───────────────────────────────────────────────────────────

function SummaryBanner({ services }: { services: ServiceHealth[] }) {
  const counts = { active: 0, degraded: 0, offline: 0, suspended: 0 };
  for (const s of services) counts[s.status] = (counts[s.status] ?? 0) + 1;

  const allGood = counts.degraded === 0 && counts.offline === 0;
  const color = allGood ? "#22c55e" : counts.offline > 0 ? "#ef4444" : "#eab308";
  const msg = allGood
    ? "All systems operational"
    : counts.offline > 0
    ? `${counts.offline} service${counts.offline > 1 ? "s" : ""} offline`
    : `${counts.degraded} service${counts.degraded > 1 ? "s" : ""} degraded`;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.75rem",
      background: `${color}12`, border: `1px solid ${color}44`,
      borderRadius: 12, padding: "0.75rem 1.25rem", marginBottom: "0.5rem",
    }}>
      <PulseDot color={color} />
      <span style={{ fontWeight: 700, color, fontSize: "0.88rem" }}>{msg}</span>
      <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginLeft: "auto" }}>
        {counts.active} active · {counts.degraded} degraded · {counts.offline} offline
        {counts.suspended > 0 ? ` · ${counts.suspended} suspended` : ""}
      </span>
    </div>
  );
}

// ─── Circuit Breaker Panel ────────────────────────────────────────────────────

function CircuitBreakerPanel({ breakers, loading, error }: {
  breakers: CircuitBreakerEntry[];
  loading: boolean;
  error: string;
}) {
  const tripped  = breakers.filter(b => b.status === "tripped").length;
  const degraded = breakers.filter(b => b.status === "degraded").length;

  return (
    <div>
      <SectionHeading>
        🔌 Airline Circuit Breakers
        {!loading && breakers.length > 0 && (
          <span style={{ marginLeft: "0.75rem", fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: "0.78rem" }}>
            {tripped > 0 && <span style={{ color: "#ef4444", marginRight: 8 }}>⚡ {tripped} tripped</span>}
            {degraded > 0 && <span style={{ color: "#eab308", marginRight: 8 }}>⚠ {degraded} degraded</span>}
            {tripped === 0 && degraded === 0 && <span style={{ color: "#22c55e" }}>✓ all closed</span>}
          </span>
        )}
      </SectionHeading>

      {error && (
        <div style={{
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)",
          borderRadius: 10, padding: "0.65rem 1rem", color: "#ef4444",
          fontSize: "0.82rem", marginBottom: "1rem",
        }}>
          Could not load circuit breakers: {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0.75rem" }}>
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: "0.75rem",
        }}>
          {breakers.map(b => {
            const cfg = CB_CONFIG[b.status] ?? CB_CONFIG.closed;
            return (
              <div
                key={b.airline}
                style={{
                  background: "var(--surface)", border: `1px solid ${b.status !== "closed" ? cfg.color + "44" : "var(--border)"}`,
                  borderRadius: 12, padding: "0.9rem 1rem",
                  display: "flex", flexDirection: "column", gap: "0.5rem",
                  transition: "box-shadow 0.15s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.88rem", textTransform: "capitalize" }}>
                    {b.airline}
                  </span>
                  <Badge label={cfg.label} color={cfg.color} bg={cfg.bg} />
                </div>

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <div style={{
                    fontSize: "0.72rem", color: "var(--text-muted)",
                    background: "var(--surface-alt)", borderRadius: 6,
                    padding: "2px 8px", border: "1px solid var(--border)",
                  }}>
                    {b.failures}/{b.max_failures} failures
                  </div>
                  {b.cooldown_remaining_s != null && (
                    <div style={{
                      fontSize: "0.72rem", color: "#ef4444",
                      background: "rgba(239,68,68,0.08)", borderRadius: 6,
                      padding: "2px 8px", border: "1px solid rgba(239,68,68,0.25)",
                    }}>
                      ⏱ {fmtCountdown(b.cooldown_remaining_s)} left
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── AWB Tracking Stats Panel ─────────────────────────────────────────────────

// Map AWB prefix → canonical airline display name
const PREFIX_LABELS: Record<string, string> = {
  "114": "El Al",      "020": "Lufthansa",  "006": "Delta",
  "057": "Air France", "074": "KLM",        "016": "United",
  "160": "Cathay",     "071": "Ethiopian",  "700": "Challenge",
  "752": "Challenge",  "014": "Air Canada", "079": "Cargo PAL",
  "501": "Silk Way",   "281": "CargoBooking","615": "DHL",
  "996": "Air Europa", "607": "Etihad",     "047": "TAP",
  "217": "Thai",
};

function AwbTrackingPanel({ stats, loading, error }: {
  stats: AwbTrackingStats | null;
  loading: boolean;
  error: string;
}) {
  return (
    <div>
      <SectionHeading>📦 AWB Tracking Queue</SectionHeading>

      {error && (
        <div style={{
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)",
          borderRadius: 10, padding: "0.65rem 1rem", color: "#ef4444",
          fontSize: "0.82rem", marginBottom: "1rem",
        }}>
          Could not load AWB stats: {error}
        </div>
      )}

      {loading || !stats ? (
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ width: 110, height: 64, borderRadius: 12, background: "var(--border)", animation: "shimmer 1.4s infinite" }} />
          ))}
        </div>
      ) : (
        <>
          {/* Big counters */}
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
            {[
              { label: "Active",         value: stats.total_active, color: "var(--text)" },
              { label: "Due Now",        value: stats.due_now,      color: stats.due_now > 0 ? "#3b82f6" : "var(--text)" },
              { label: "Halted",         value: stats.halted,       color: stats.halted > 0 ? "#eab308" : "var(--text)" },
              { label: "3+ Errors",      value: stats.errors_3plus, color: stats.errors_3plus > 0 ? "#ef4444" : "var(--text)" },
            ].map(item => (
              <div
                key={item.label}
                style={{
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: 14, padding: "1rem 1.5rem", minWidth: 110,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                }}
              >
                <span style={{ fontSize: "1.75rem", fontWeight: 800, color: item.color, fontFamily: "monospace", lineHeight: 1 }}>
                  {item.value.toLocaleString()}
                </span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          {/* Per-airline breakdown */}
          {stats.by_airline.length > 0 && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "1rem 1.25rem" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
                Shipments per Airline
              </div>

              {/* Bar chart */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                {(() => {
                  const max = Math.max(1, ...stats.by_airline.map(a => a.count));
                  return stats.by_airline.map(({ prefix, count }) => (
                    <div key={prefix} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <span style={{ width: 90, fontSize: "0.78rem", color: "var(--text)", textAlign: "right", flexShrink: 0, fontWeight: 600 }}>
                        {PREFIX_LABELS[prefix] ?? prefix}
                      </span>
                      <div style={{ flex: 1, height: 18, background: "var(--surface-alt)", borderRadius: 6, overflow: "hidden" }}>
                        <div style={{
                          height: "100%",
                          width: `${(count / max) * 100}%`,
                          background: "linear-gradient(90deg, #3b82f6, #6366f1)",
                          borderRadius: 6,
                          transition: "width 0.4s ease",
                        }} />
                      </div>
                      <span style={{ width: 32, fontSize: "0.78rem", color: "var(--text-muted)", textAlign: "right", fontFamily: "monospace" }}>
                        {count}
                      </span>
                    </div>
                  ));
                })()}
              </div>

              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.6rem", textAlign: "right" }}>
                as of {fmtTime(stats.checked_at)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Tracker Table ────────────────────────────────────────────────────────────

const PROXY_BADGE: Record<TrackerEntry["proxy"], { label: string; color: string; bg: string }> = {
  none:     { label: "None",        color: "#8b9cb3", bg: "rgba(139,156,179,0.10)" },
  standard: { label: "IPRoyal",     color: "#3b82f6", bg: "rgba(59,130,246,0.10)"  },
  premium:  { label: "BrightData",  color: "#a855f7", bg: "rgba(168,85,247,0.10)"  },
  unknown:  { label: "Unknown",     color: "#8b9cb3", bg: "rgba(139,156,179,0.08)" },
};

function TrackerTable({ trackers, loading, error }: {
  trackers: TrackerEntry[];
  loading: boolean;
  error: string;
}) {
  const tripped  = trackers.filter(t => t.cb_status === "tripped").length;
  const degraded = trackers.filter(t => t.cb_status === "degraded").length;

  const thStyle: React.CSSProperties = {
    textAlign: "left", padding: "0.6rem 0.85rem",
    fontSize: "0.7rem", color: "var(--text-muted)",
    textTransform: "uppercase", letterSpacing: "0.07em",
    borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
    fontWeight: 600,
  };
  const tdStyle: React.CSSProperties = {
    padding: "0.6rem 0.85rem",
    borderBottom: "1px solid var(--border)",
    fontSize: "0.82rem",
    verticalAlign: "middle",
  };

  return (
    <div>
      <SectionHeading>
        ✈️ AWB Trackers
        {!loading && trackers.length > 0 && (
          <span style={{ marginLeft: "0.75rem", fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: "0.78rem" }}>
            {trackers.length} airlines
            {tripped > 0 && <span style={{ color: "#ef4444", marginLeft: 8 }}>· ⚡ {tripped} tripped</span>}
            {degraded > 0 && <span style={{ color: "#eab308", marginLeft: 8 }}>· ⚠ {degraded} degraded</span>}
            {tripped === 0 && degraded === 0 && <span style={{ color: "#22c55e", marginLeft: 8 }}>· all operational</span>}
          </span>
        )}
      </SectionHeading>

      {error && (
        <div style={{
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)",
          borderRadius: 10, padding: "0.65rem 1rem", color: "#ef4444",
          fontSize: "0.82rem", marginBottom: "1rem",
        }}>
          Could not load tracker list: {error}
        </div>
      )}

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "var(--surface-alt)" }}>
              <tr>
                <th style={thStyle}>Airline</th>
                <th style={thStyle}>IATA</th>
                <th style={thStyle}>AWB Prefix</th>
                <th style={thStyle}>Proxy</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Failures</th>
                <th style={thStyle}>Cooldown</th>
              </tr>
            </thead>
            <tbody>
              {loading && trackers.length === 0
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} style={tdStyle}>
                          <div style={{ height: 12, width: j === 0 ? "80%" : "60%", borderRadius: 6, background: "var(--border)", animation: "shimmer 1.4s infinite" }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : trackers.map(t => {
                    const cbCfg = CB_CONFIG[t.cb_status] ?? CB_CONFIG.closed;
                    const proxyBadge = PROXY_BADGE[t.proxy] ?? PROXY_BADGE.unknown;
                    const rowBg = t.cb_status === "tripped"
                      ? "rgba(239,68,68,0.04)"
                      : t.cb_status === "degraded"
                      ? "rgba(234,179,8,0.04)"
                      : "transparent";

                    return (
                      <tr
                        key={t.key}
                        style={{ background: rowBg, transition: "background 0.15s" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-alt)")}
                        onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
                      >
                        {/* Airline name */}
                        <td style={{ ...tdStyle, fontWeight: 600 }}>
                          {t.display}
                        </td>

                        {/* IATA codes */}
                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {t.iata_codes.map(code => (
                              <span key={code} style={{
                                fontFamily: "monospace", fontSize: "0.78rem",
                                background: "var(--surface-alt)", border: "1px solid var(--border)",
                                borderRadius: 5, padding: "1px 7px", color: "var(--text-muted)",
                              }}>{code}</span>
                            ))}
                          </div>
                        </td>

                        {/* AWB prefixes */}
                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {t.awb_prefixes.map(p => (
                              <span key={p} style={{
                                fontFamily: "monospace", fontSize: "0.78rem",
                                background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)",
                                borderRadius: 5, padding: "1px 7px", color: "#3b82f6",
                              }}>{p}</span>
                            ))}
                          </div>
                        </td>

                        {/* Proxy type */}
                        <td style={tdStyle}>
                          <span style={{
                            display: "inline-block", fontSize: "0.7rem", fontWeight: 700,
                            background: proxyBadge.bg, border: `1px solid ${proxyBadge.color}44`,
                            color: proxyBadge.color, borderRadius: 20,
                            padding: "1px 9px", letterSpacing: "0.04em",
                          }}>
                            {proxyBadge.label}
                          </span>
                        </td>

                        {/* CB Status */}
                        <td style={tdStyle}>
                          <Badge label={cbCfg.label} color={cbCfg.color} bg={cbCfg.bg} />
                        </td>

                        {/* Failure count */}
                        <td style={{ ...tdStyle, fontFamily: "monospace", color: t.cb_failures > 0 ? cbCfg.color : "var(--text-muted)" }}>
                          {t.cb_failures}/{t.cb_max_failures}
                        </td>

                        {/* Cooldown */}
                        <td style={{ ...tdStyle, fontFamily: "monospace", color: t.cooldown_remaining_s != null ? "#ef4444" : "var(--text-muted)" }}>
                          {t.cooldown_remaining_s != null ? `⏱ ${fmtCountdown(t.cooldown_remaining_s)}` : "—"}
                        </td>
                      </tr>
                    );
                  })
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Auto-refresh controller ──────────────────────────────────────────────────

const AUTO_REFRESH_SEC = 30;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ServicesStatus() {
  const [services,   setServices]   = useState<ServiceHealth[]>([]);
  const [breakers,   setBreakers]   = useState<CircuitBreakerEntry[]>([]);
  const [awbStats,   setAwbStats]   = useState<AwbTrackingStats | null>(null);
  const [trackers,   setTrackers]   = useState<TrackerEntry[]>([]);

  const [loadingSvc, setLoadingSvc] = useState(false);
  const [loadingCb,  setLoadingCb]  = useState(false);
  const [loadingAwb, setLoadingAwb] = useState(false);
  const [loadingTrk, setLoadingTrk] = useState(false);

  const [errSvc, setErrSvc] = useState("");
  const [errCb,  setErrCb]  = useState("");
  const [errAwb, setErrAwb] = useState("");
  const [errTrk, setErrTrk] = useState("");

  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [countdown,   setCountdown]   = useState(AUTO_REFRESH_SEC);

  const loadAll = useCallback(async () => {
    setLoadingSvc(true); setLoadingCb(true); setLoadingAwb(true); setLoadingTrk(true);
    setErrSvc(""); setErrCb(""); setErrAwb(""); setErrTrk("");

    const [svcRes, cbRes, awbRes, trkRes] = await Promise.allSettled([
      fetchServicesStatus(),
      fetchCircuitBreakers(),
      fetchAwbTrackingStats(),
      fetchTrackers(),
    ]);

    if (svcRes.status === "fulfilled") setServices(svcRes.value);
    else setErrSvc(svcRes.reason instanceof Error ? svcRes.reason.message : "Failed");

    if (cbRes.status === "fulfilled") setBreakers(cbRes.value);
    else setErrCb(cbRes.reason instanceof Error ? cbRes.reason.message : "Failed");

    if (awbRes.status === "fulfilled") setAwbStats(awbRes.value);
    else setErrAwb(awbRes.reason instanceof Error ? awbRes.reason.message : "Failed");

    if (trkRes.status === "fulfilled") setTrackers(trkRes.value);
    else setErrTrk(trkRes.reason instanceof Error ? trkRes.reason.message : "Failed");

    setLoadingSvc(false); setLoadingCb(false); setLoadingAwb(false); setLoadingTrk(false);
    setLastRefresh(new Date());
    setCountdown(AUTO_REFRESH_SEC);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const anyLoading = loadingSvc || loadingCb || loadingAwb || loadingTrk;

  useEffect(() => {
    if (anyLoading) return;
    const tick = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { loadAll(); return AUTO_REFRESH_SEC; }
        return c - 1;
      });
    }, 1_000);
    return () => clearInterval(tick);
  }, [anyLoading, loadAll]);

  return (
    <>
      <style>{`
        @keyframes pulse-ring {
          0%   { box-shadow: 0 0 0 0 currentColor; }
          70%  { box-shadow: 0 0 0 6px transparent; }
          100% { box-shadow: 0 0 0 0 transparent; }
        }
        @keyframes shimmer {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div>
        {/* ── Page header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800 }}>Services Status</h1>
            <p style={{ margin: "0.25rem 0 0", color: "var(--text-muted)", fontSize: "0.83rem" }}>
              Live health check of all external dependencies
              {lastRefresh && <> · Updated {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</>}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
              Auto-refresh in {countdown}s
            </span>
            <button
              id="services-refresh-btn"
              onClick={loadAll}
              disabled={anyLoading}
              style={{
                display: "flex", alignItems: "center", gap: "0.4rem",
                padding: "8px 16px", borderRadius: 8,
                border: "1px solid var(--border)", background: "var(--surface)",
                color: anyLoading ? "var(--text-muted)" : "var(--accent)",
                fontSize: "0.84rem", fontWeight: 600,
                cursor: anyLoading ? "not-allowed" : "pointer",
              }}
            >
              <span style={{ display: "inline-block", animation: anyLoading ? "spin 0.8s linear infinite" : "none" }}>↻</span>
              {anyLoading ? "Checking…" : "Refresh Now"}
            </button>
          </div>
        </div>

        {/* ── Summary banner ── */}
        {!loadingSvc && services.length > 0 && <SummaryBanner services={services} />}

        {/* ── External Services ── */}
        <SectionHeading>🌐 External Services</SectionHeading>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: "1.1rem" }}>
          {loadingSvc && services.length === 0
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            : services.map(svc => <ServiceCard key={svc.id} svc={svc} />)
          }
          {errSvc && !loadingSvc && (
            <div style={{ gridColumn: "1/-1", color: "#ef4444", fontSize: "0.83rem" }}>
              {errSvc}
            </div>
          )}
        </div>

        {/* ── Circuit Breakers ── */}
        <CircuitBreakerPanel breakers={breakers} loading={loadingCb} error={errCb} />

        {/* ── AWB Tracking ── */}
        <AwbTrackingPanel stats={awbStats} loading={loadingAwb} error={errAwb} />

        {/* ── AWB Trackers table ── */}
        <TrackerTable trackers={trackers} loading={loadingTrk} error={errTrk} />
      </div>
    </>
  );
}
