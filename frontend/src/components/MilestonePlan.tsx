import type { LucideIcon } from "lucide-react";
import {
  Bookmark,
  PackageCheck,
  PlaneTakeoff,
  PlaneLanding,
  BellRing,
  CircleCheck,
} from "lucide-react";
import type { TrackingEvent, TrackingResponse } from "../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Milestone {
  key: string;
  label: string;
  Icon: LucideIcon;
  event: TrackingEvent | null;
  isCompleted: boolean;
  isActive: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateShort(raw?: string | null): string | null {
  if (!raw) return null;
  // "12 FEB 09:42"
  const m1 = raw.match(/^(\d{1,2})\s+([A-Z]{3})(?:\s+(\d{2}:\d{2}))?/i);
  if (m1) {
    const day = m1[1].padStart(2, "0");
    const mon = m1[2].toUpperCase();
    const time = m1[3] ?? null;
    return time ? `${day} ${mon} / ${time}` : `${day} ${mon}`;
  }
  // "12/02/26 03:28"
  const m2 = raw.match(/^(\d{2})\/(\d{2})\/\d{2}(?:\s+(\d{2}:\d{2}))?/);
  if (m2) {
    const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    const mon = months[parseInt(m2[2], 10) - 1] ?? "???";
    const day = m2[1];
    const time = m2[3] ?? null;
    return time ? `${day} ${mon} / ${time}` : `${day} ${mon}`;
  }
  return raw;
}

function extractPcs(s?: string | null): string | null {
  if (!s) return null;
  const m = s.match(/(\d+)/);
  return m ? `${m[1]} pcs` : null;
}

function findEvent(events: TrackingEvent[], codes: string[]): TrackingEvent | null {
  for (const code of codes) {
    const ev = events.filter(e => e.status_code === code).pop();
    if (ev) return ev;
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  data: TrackingResponse;
}

export default function MilestonePlan({ data }: Props) {
  const events = data.events;

  const bkdEv = findEvent(events, ["BKD"]);
  const rcsEv = findEvent(events, ["RCS", "RCF"]);
  const depEv = findEvent(events, ["DEP"]);
  const arrEv = findEvent(events, ["ARR", "RCF"]);
  const nfdEv = findEvent(events, ["NFD"]);
  const dlvEv = findEvent(events, ["DLV"]);

  const completedKeys: string[] = [];
  if (bkdEv) completedKeys.push("BKD");
  if (rcsEv) completedKeys.push("RCS");
  if (depEv) completedKeys.push("DEP");
  if (arrEv) completedKeys.push("ARR");
  if (nfdEv) completedKeys.push("NFD");
  if (dlvEv) completedKeys.push("DLV");
  const lastCompleted = completedKeys[completedKeys.length - 1] ?? null;

  const milestones: Milestone[] = [
    { key: "BKD", label: "BKD", Icon: Bookmark,    event: bkdEv, isCompleted: !!bkdEv, isActive: lastCompleted === "BKD" && !rcsEv },
    { key: "RCS", label: "RCS", Icon: PackageCheck, event: rcsEv, isCompleted: !!rcsEv, isActive: lastCompleted === "RCS" && !depEv },
    { key: "DEP", label: "DEP", Icon: PlaneTakeoff, event: depEv, isCompleted: !!depEv, isActive: lastCompleted === "DEP" && !arrEv },
    { key: "ARR", label: "ARR", Icon: PlaneLanding, event: arrEv, isCompleted: !!arrEv, isActive: lastCompleted === "ARR" && !nfdEv },
    { key: "NFD", label: "NFD", Icon: BellRing,     event: nfdEv, isCompleted: !!nfdEv, isActive: lastCompleted === "NFD" && !dlvEv },
    { key: "DLV", label: "DLV", Icon: CircleCheck,  event: dlvEv, isCompleted: !!dlvEv, isActive: lastCompleted === "DLV" },
  ];

  const flight = depEv?.flight ?? data.flight ?? null;
  const depDate = formatDateShort(depEv?.date ?? depEv?.departure_date);

  const DARK_BLUE = "#0d1e40";
  const ACCENT    = "#1e4db7";
  const GOLD      = "#f0b429";
  const DIM_BLUE  = "#2a3f6e";

  return (
    <div style={{
      background: DARK_BLUE,
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
      padding: "1.25rem 1.5rem",
      marginBottom: "1rem",
    }}>
      <div style={{
        fontSize: "0.72rem", fontWeight: 700,
        color: "rgba(255,255,255,0.45)", letterSpacing: "0.1em",
        marginBottom: "1.25rem", textTransform: "uppercase",
      }}>
        Milestone Plan
      </div>

      <div style={{ display: "flex", alignItems: "stretch", overflowX: "auto" }}>
        {milestones.map((ms, idx) => {
          const isLast = idx === milestones.length - 1;
          const isDone = ms.isCompleted;

          const nodeBg     = isDone ? ACCENT : DIM_BLUE;
          const iconColor  = isDone ? "#fff" : "rgba(255,255,255,0.3)";
          const labelColor = isDone ? "#fff" : "rgba(255,255,255,0.3)";
          const connColor  = isDone ? ACCENT : DIM_BLUE;
          const goldDlv    = ms.key === "DLV" && isDone;

          const evDate = ms.event
            ? formatDateShort(
                ms.event.date ??
                ms.event.departure_date ??
                ms.event.arrival_date ??
                ms.event.reception_date ??
                ms.event.release_date
              )
            : null;
          const evPcs = ms.event ? extractPcs(ms.event.pieces) : null;

          return (
            <div key={ms.key} style={{ display: "flex", alignItems: "center", flex: ms.key === "DEP" ? 2 : 1, minWidth: 0 }}>
              {/* Milestone node */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 64 }}>
                {/* Icon circle */}
                <div style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: nodeBg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: isDone ? `0 0 0 3px rgba(30,77,183,0.35)` : "none",
                  flexShrink: 0,
                  position: "relative",
                  transition: "background 0.3s",
                }}>
                  <ms.Icon
                    size={18}
                    strokeWidth={2}
                    style={{ color: goldDlv ? GOLD : iconColor }}
                  />
                  {ms.isActive && (
                    <span style={{
                      position: "absolute", inset: -3, borderRadius: "50%",
                      border: `2px solid ${ACCENT}`,
                      animation: "milestone-pulse 1.6s ease-in-out infinite",
                    }} />
                  )}
                </div>

                {/* Label */}
                <div style={{
                  fontFamily: "monospace", fontWeight: 700, fontSize: "0.75rem",
                  color: labelColor, marginTop: 6, whiteSpace: "nowrap",
                }}>
                  {ms.label}
                </div>

                {/* Date */}
                {evDate && (
                  <div style={{
                    fontSize: "0.63rem",
                    color: isDone ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.22)",
                    marginTop: 2, whiteSpace: "nowrap",
                  }}>
                    {evDate}
                  </div>
                )}

                {/* Pieces */}
                {evPcs && (
                  <div style={{
                    fontSize: "0.6rem",
                    color: isDone ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.18)",
                    marginTop: 1, whiteSpace: "nowrap",
                  }}>
                    {evPcs}
                  </div>
                )}
              </div>

              {/* Connector */}
              {!isLast && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", margin: "0 4px", minWidth: 24 }}>
                  {/* Flight info above the DEP → ARR connector */}
                  {ms.key === "DEP" && (flight || depDate) && (
                    <div style={{
                      fontSize: "0.63rem", fontWeight: 600,
                      color: "rgba(255,255,255,0.5)",
                      marginBottom: 4, whiteSpace: "nowrap",
                    }}>
                      {[flight, depDate].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  <div style={{ width: "100%", height: 2, background: connColor, borderRadius: 1, position: "relative" }}>
                    <div style={{
                      position: "absolute", right: -1, top: "50%",
                      transform: "translateY(-50%)",
                      width: 0, height: 0,
                      borderTop: "5px solid transparent",
                      borderBottom: "5px solid transparent",
                      borderLeft: `6px solid ${connColor}`,
                    }} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes milestone-pulse {
          0%   { opacity: 1;  transform: scale(1);   }
          70%  { opacity: 0;  transform: scale(1.45);}
          100% { opacity: 0;  transform: scale(1.45);}
        }
      `}</style>
    </div>
  );
}
