
import type { LucideIcon } from "lucide-react";
import {
  Bookmark,
  PackageCheck,
  PlaneTakeoff,
  PlaneLanding,
  BellRing,
  CircleCheck,
  AlertTriangle,
  Clock
} from "lucide-react";
import type { TrackingEvent, TrackingResponse } from "../lib/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateShort(raw?: string | null): string | null {
  if (!raw) return null;
  // "12 FEB 09:42" or "12 FEB 2026"
  const m1 = raw.match(/^(\d{1,2})\s+([A-Z]{3})(?:\s+(\d{2}:?\d{2}|\d{4}))?/i);
  if (m1) {
    const day = m1[1].padStart(2, "0");
    const mon = m1[2].toUpperCase();
    const time = m1[3] && !m1[3].match(/^\d{4}$/) ? m1[3] : null; 
    return time ? `${day} ${mon} / ${time}` : `${day} ${mon}`;
  }
  
  // "02/24/2026 1741" or "24/02/2026 17:41"
  const m2 = raw.match(/^(\d{2})\/(\d{2})\/(\d{2,4})(?:\s+(\d{2}):?(\d{2}))?/);
  if (m2) {
    const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    let part1 = parseInt(m2[1], 10);
    let part2 = parseInt(m2[2], 10);
    // Auto-detect US vs EU format
    let m = part2; let d = part1; 
    if (part1 <= 12 && part2 > 12) { m = part1; d = part2; } // Definitely MM/DD
    
    const mon = months[Math.max(0, m - 1)] ?? "???";
    const day = String(d).padStart(2, "0");
    const time = m2[4] ? `${m2[4]}:${m2[5]}` : null;
    return time ? `${day} ${mon} / ${time}` : `${day} ${mon}`;
  }
  return raw;
}

function extractPcsRaw(s?: string | null): number | null {
  if (!s) return null;
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// ─── Types and Grouping Logic ────────────────────────────────────────────────

interface UIMilestone {
  id: string;
  key: string;
  label: string;
  Icon: LucideIcon;
  event: TrackingEvent | null;
  isCompleted: boolean;
  isActive: boolean;
  flight?: string | null;
  isAlert?: boolean;
  alertMsg?: string;
  pcsText?: string;
  dateStr?: string | null;
}

interface FlightLeg {
  flight: string | null;
  dep: TrackingEvent | null;
  arr: TrackingEvent | null;
}

function buildDynamicSequence(events: TrackingEvent[], totalPiecesStr?: string): UIMilestone[] {
  const sequence: UIMilestone[] = [];
  const totalExpectedPcs = extractPcsRaw(totalPiecesStr) || 0;

  // Since events are usually newest-first or oldest-first, let's just make a chronological copy
  // by checking the first and last dates if possible. For simplicity, we assume they are oldest-first
  // if not, we reverse. But we'll just read them as-is (assuming they are usually shown in chronological order 
  // or we can sort them ideally. For now, let's just reverse them to process chronologically if they seem newest-first.
  // Actually, CargoGent delta showed DEP 22nd then ARR 23rd at the top or bottom? The UI mapping loops them.
  // Let's assume `events` inside API response is basically natural chronological order.
  
  // To be safe, we extract them chronologically by looking at the logical progression.
  const bkdEvents = events.filter(e => e.status_code === "BKD");
  const rcsEvents = events.filter(e => e.status_code === "RCS" || e.status_code === "RCF");
  const depEvents = events.filter(e => e.status_code === "DEP");
  const arrEvents = events.filter(e => e.status_code === "ARR");
  const nfdEvents = events.filter(e => e.status_code === "NFD");
  const dlvEvents = events.filter(e => e.status_code === "DLV");

  // Format piece string
  const formatPcs = (ev: TrackingEvent | null) => {
    if (!ev) return undefined;
    const actualPcs = extractPcsRaw(ev.pieces) || extractPcsRaw(ev.actual_pieces);
    if (!actualPcs) return undefined;
    if (totalExpectedPcs > 0 && actualPcs < totalExpectedPcs) {
      return `${actualPcs}/${totalExpectedPcs} pcs`; // partial
    }
    return `${actualPcs} pcs`;
  };

  const isPartial = (ev: TrackingEvent | null) => {
    if (!ev) return false;
    const actualPcs = extractPcsRaw(ev.pieces) || extractPcsRaw(ev.actual_pieces);
    return totalExpectedPcs > 0 && actualPcs !== null && actualPcs < totalExpectedPcs;
  };

  // 1. BKD
  const bkd = bkdEvents[bkdEvents.length - 1]; 
  sequence.push({
    id: "BKD-0", key: "BKD", label: bkd?.location ? `${bkd.location} BKD` : "BKD", 
    Icon: Bookmark, event: bkd || null, isCompleted: !!bkd, isActive: false,
    pcsText: formatPcs(bkd), isAlert: isPartial(bkd)
  });

  // 2. RCS
  const rcs = rcsEvents[rcsEvents.length - 1];
  sequence.push({
    id: "RCS-0", key: "RCS", label: rcs?.location ? `${rcs.location} RCS` : "RCS",
    Icon: PackageCheck, event: rcs || null, isCompleted: !!rcs, isActive: false,
    pcsText: formatPcs(rcs), isAlert: isPartial(rcs)
  });

  // 3. Flight Legs (Dynamic matching of DEP and ARR)
  const legs: FlightLeg[] = [];
  let currentLeg: FlightLeg | null = null;
  
  // We iterate through all events to capture DEP/ARR chronologically
  for (const ev of events) {
    if (ev.status_code === "DEP") {
      if (currentLeg && !currentLeg.arr) legs.push(currentLeg); // close incomplete
      currentLeg = { flight: ev.flight || null, dep: ev, arr: null };
    } else if (ev.status_code === "ARR") {
      if (currentLeg) {
        currentLeg.arr = ev;
        legs.push(currentLeg);
        currentLeg = null;
      } else {
         // ARR without previous DEP in this sequence
         legs.push({ flight: ev.flight || null, dep: null, arr: ev });
      }
    }
  }
  if (currentLeg) legs.push(currentLeg);

  if (legs.length === 0 && (depEvents.length > 0 || arrEvents.length > 0)) {
     // fallback if loop failed
     legs.push({ flight: null, dep: depEvents[0] || null, arr: arrEvents[0] || null });
  }

  // If no flight legs at all, render a default blank leg placeholder
  if (legs.length === 0) {
    legs.push({ flight: null, dep: null, arr: null });
  }

  legs.forEach((leg, i) => {
    sequence.push({
      id: `DEP-${i}`, key: "DEP", label: leg.dep?.location ? `${leg.dep.location} DEP` : "DEP",
      Icon: PlaneTakeoff, event: leg.dep, isCompleted: !!leg.dep, isActive: false,
      flight: leg.flight || leg.dep?.flight || leg.arr?.flight,
      pcsText: formatPcs(leg.dep), isAlert: isPartial(leg.dep),
      alertMsg: isPartial(leg.dep) ? "Missing pieces" : undefined
    });
    sequence.push({
      id: `ARR-${i}`, key: "ARR", label: leg.arr?.location ? `${leg.arr.location} ARR` : "ARR",
      Icon: PlaneLanding, event: leg.arr, isCompleted: !!leg.arr, isActive: false,
      flight: leg.flight || leg.dep?.flight || leg.arr?.flight,
      pcsText: formatPcs(leg.arr), isAlert: isPartial(leg.arr),
      alertMsg: isPartial(leg.arr) ? "Partial arrival" : undefined
    });
  });

  // 4. NFD
  const nfd = nfdEvents[nfdEvents.length - 1];
  sequence.push({
    id: "NFD-0", key: "NFD", label: nfd?.location ? `${nfd.location} NFD` : "NFD",
    Icon: BellRing, event: nfd || null, isCompleted: !!nfd, isActive: false,
    pcsText: formatPcs(nfd), isAlert: isPartial(nfd)
  });

  // 5. DLV
  const dlv = dlvEvents[dlvEvents.length - 1];
  sequence.push({
    id: "DLV-0", key: "DLV", label: dlv?.location ? `${dlv.location} DLV` : "DLV",
    Icon: CircleCheck, event: dlv || null, isCompleted: !!dlv, isActive: false,
    pcsText: formatPcs(dlv), isAlert: isPartial(dlv)
  });

  // Determine ACTIVE pulsing node (the first uncompleted node whose PREVIOUS node IS completed)
  let activeIndex = -1;
  for (let i = sequence.length - 1; i >= 0; i--) {
     if (sequence[i].isCompleted) {
        activeIndex = i === sequence.length - 1 ? i : i + 1;
        break;
     }
  }
  if (activeIndex === -1) activeIndex = 0; // if nothing completed, BKD is active
  if (activeIndex < sequence.length) sequence[activeIndex].isActive = true;

  return sequence;
}


// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  data: TrackingResponse;
}

export default function MilestonePlan({ data }: Props) {
  const events = data.events || [];
  
  // Find shipment piece/weight total from the first available tracker property
  const lastEventStr = events[events.length - 1];
  const totalPieces = events.find(e => e.pieces)?.pieces || lastEventStr?.pieces;
  
  const milestones = buildDynamicSequence(events, totalPieces);

  // Derive Current Status
  const currentStatusNode = milestones.slice().reverse().find(m => m.isCompleted);
  const currentStatusMsg = data.status === "Delivered" ? "Delivered" : 
                            currentStatusNode ? `In Transit (${currentStatusNode.label})` : "Pending";
  
  const isDelivered = data.status === "Delivered" || milestones[milestones.length - 1].isCompleted;
  const isError = data.status === "Error";
  const statusColor = isError ? "#f87171" : isDelivered ? "#34d399" : "#60a5fa";

  const DARK_BLUE = "#0d1e40";
  const ACCENT    = "#1e4db7";
  const GOLD      = "#f0b429";
  const DIM_BLUE  = "#2a3f6e";
  const ALERT_RED = "#ef4444";

  return (
    <div style={{
      background: DARK_BLUE,
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
      padding: "1.5rem 1.5rem",
      marginBottom: "1rem",
    }}>
      {/* High Visibility Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
         <div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: statusColor, display: "flex", alignItems: "center", gap: "8px" }}>
               {isError ? <AlertTriangle size={20} /> : <Clock size={20} />} 
               Current status: {currentStatusMsg}
            </div>
            {totalPieces && (
              <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.6)", marginTop: "4px" }}>
                {totalPieces} pc(s)
              </div>
            )}
         </div>
      </div>

      {/* Wrapping Timeline Container */}
      <div style={{ display: "flex", alignItems: "stretch", overflowX: "auto", paddingBottom: "1.5rem" }}>
        {milestones.map((ms, idx) => {
          const isLast = idx === milestones.length - 1;
          const isDone = ms.isCompleted;

          const nodeBg     = isDone ? (ms.isAlert ? ALERT_RED : ACCENT) : DIM_BLUE;
          const iconColor  = isDone ? "#fff" : "rgba(255,255,255,0.3)";
          const labelColor = ms.isAlert ? ALERT_RED : (isDone ? "#fff" : "rgba(255,255,255,0.3)");
          const connColor  = isDone ? (ms.isAlert ? ALERT_RED : ACCENT) : DIM_BLUE;
          const goldDlv    = ms.key === "DLV" && isDone && !ms.isAlert;

          const evDate = ms.event
            ? formatDateShort(
                ms.event.date ??
                ms.event.departure_date ??
                ms.event.arrival_date ??
                ms.event.reception_date ??
                ms.event.release_date
              )
            : null;

          return (
            <div key={`${ms.id}-${idx}`} style={{ display: "flex", alignItems: "center", flex: ms.key === "DEP" ? 1.5 : 1, minWidth: 90 }}>
              {/* Milestone node */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 64, position: "relative" }}>
                
                {/* Alert Badge hovering logic */}
                {ms.isAlert && (
                   <div style={{ position: "absolute", top: -25, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <AlertTriangle size={16} color={GOLD} fill="rgba(240, 180, 41, 0.2)" />
                      <span style={{ fontSize: "0.55rem", color: GOLD, marginTop: 2, whiteSpace: "nowrap" }}>{ms.alertMsg}</span>
                   </div>
                )}

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
                  color: labelColor, marginTop: 10, whiteSpace: "nowrap",
                }}>
                  {ms.label}
                </div>

                {/* Date */}
                {evDate && (
                  <div style={{
                    fontSize: "0.63rem",
                    color: isDone ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.22)",
                    marginTop: 3, whiteSpace: "nowrap",
                  }}>
                    {evDate}
                  </div>
                )}

                {/* Dynamic Pieces format (1/3 pcs or 3 pcs) */}
                {ms.pcsText && (
                  <div style={{
                    fontSize: "0.65rem",
                    fontWeight: ms.isAlert ? 600 : 400,
                    color: ms.isAlert ? GOLD : (isDone ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.18)"),
                    marginTop: 3, whiteSpace: "nowrap",
                    border: ms.isAlert ? `1px solid ${GOLD}` : "none",
                    padding: ms.isAlert ? "1px 4px" : "0",
                    borderRadius: "4px"
                  }}>
                    {ms.pcsText}
                  </div>
                )}
              </div>

              {/* Connector */}
              {!isLast && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", margin: "0 4px", minWidth: 30 }}>
                  {/* Flight info above the DEP → ARR connector */}
                  {ms.key === "DEP" && ms.flight && (
                    <div style={{
                      fontSize: "0.63rem", fontWeight: 600,
                      color: "rgba(255,255,255,0.5)",
                      marginBottom: 4, whiteSpace: "nowrap",
                    }}>
                      {ms.flight}
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
