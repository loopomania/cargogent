
import { Plane, CheckCircle, Clock, Bookmark, Archive, Package } from "lucide-react";
import type { TrackingEvent, TrackingResponse } from "../lib/api";

// ─── Constants ─────────────────────────────────────────────────────────────────

const C = {
  bg:      "#0d1e40",
  bgCard:  "#0f2347",
  border:  "rgba(255,255,255,0.08)",
  accent:  "#3b82f6",
  green:   "#34d399",
  amber:   "#f0b429",
  dim:     "rgba(255,255,255,0.45)",
  dim2:    "rgba(255,255,255,0.22)",
  white:   "rgba(255,255,255,0.9)",
  red:     "#f87171",
  connLine:"rgba(255,255,255,0.18)",
};

// ─── Date helpers ───────────────────────────────────────────────────────────────

function fmtDate(raw?: string | null): string {
  if (!raw) return "—";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (iso) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${iso[3]} ${months[parseInt(iso[2])-1]} ${iso[4]}:${iso[5]}`;
  }
  // "10 Mar 26 00:00" or "10 Mar 26"
  const m = raw.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})\s*(\d{2}:\d{2})?/i);
  if (m) {
    const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
    const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const mo = (months.indexOf(m[2].toLowerCase())+1).toString().padStart(2,'0');
    void mo;
    return m[4] ? `${m[1].padStart(2,'0')} ${m[2]} ${yr.slice(2)} ${m[4]}` : `${m[1].padStart(2,'0')} ${m[2]} ${yr.slice(2)}`;
  }
  // "14/03/26 18:03"
  const dm = raw.match(/^(\d{2})\/(\d{2})\/(\d{2})\s*(\d{2}:\d{2})?/);
  if (dm) {
    const months = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${dm[1]} ${months[parseInt(dm[2])]} ${dm[3]}` + (dm[4] ? ` ${dm[4]}` : "");
  }
  return raw.length > 20 ? raw.slice(0, 20) : raw;
}

// ─── Milestone definitions ──────────────────────────────────────────────────────

// @ts-ignore
const MILESTONES: { code: string; label: string; desc: string; group: "pre"|"dep"|"arr"|"dlv" }[] = [
  { code: "BKD", label: "Booked",      desc: "Booking Confirmed", group: "pre" },
  { code: "RCS", label: "Received",    desc: "Cargo Accepted",    group: "pre" },
  { code: "FOH", label: "On Hand",     desc: "Freight On Hand",   group: "pre" },
  { code: "DIS", label: "Picked Up",   desc: "Picked Up",         group: "pre" },
  { code: "MAN", label: "Manifested",  desc: "Manifested",        group: "dep" },
  { code: "DEP", label: "Departed",    desc: "Departed",          group: "dep" },
  { code: "ARR", label: "Arrived",     desc: "Arrived at Dest",   group: "arr" },
  { code: "RCF", label: "Received",    desc: "Received at Dest",  group: "arr" },
  { code: "NFD", label: "Notified",    desc: "Notified",          group: "arr" },
  { code: "AWD", label: "Delivered",   desc: "Awaiting Delivery", group: "arr" },
  { code: "DLV", label: "Delivered",   desc: "Delivered",         group: "dlv" },
];

// ─── Milestone icon ─────────────────────────────────────────────────────────────

function MilestoneIcon({ code, active, done }: { code: string; active: boolean; done: boolean }) {
  const color = done ? C.green : active ? C.amber : C.dim2;
  const bg = done ? "rgba(52,211,153,0.12)" : active ? "rgba(240,180,41,0.12)" : "rgba(255,255,255,0.04)";
  const sz = 20;
  const icon = (() => {
    if (code === "BKD") return <Bookmark size={sz} color={color} />;
    if (code === "RCS" || code === "FOH" || code === "DIS") return <Archive size={sz} color={color} />;
    if (code === "MAN") return <Package size={sz} color={color} />;
    if (code === "DEP") return <Plane size={sz} color={color} />;
    if (code === "ARR") return <Plane size={sz} color={color} style={{ transform: "rotate(90deg)" }} />;
    if (code === "RCF") return <Archive size={sz} color={color} />;
    if (code === "NFD" || code === "AWD") return <Clock size={sz} color={color} />;
    if (code === "DLV") return <CheckCircle size={sz} color={color} />;
    return <Clock size={sz} color={color} />;
  })();

  return (
    <div style={{
      width: 52, height: 52, borderRadius: "50%",
      background: bg,
      border: `2px solid ${done ? C.green : active ? C.amber : C.border}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.2s",
      flexShrink: 0,
    }}>
      {icon}
    </div>
  );
}

// ─── Build legs from events ─────────────────────────────────────────────────────

interface SegmentInfo { from: string; to: string; service: string; departureStr?: string | null }

function parseSegmentRemark(remarks?: string | null): SegmentInfo | null {
  if (!remarks) return null;
  const seg = remarks.match(/Segment:\s*([A-Z]{2,4})\s+to\s+([A-Z]{2,4})/i);
  const svc = remarks.match(/Service:\s*([A-Z]+)/i);
  const dep = remarks.match(/Departure:\s*(.+?)(?:$|\n)/i);
  if (!seg) return null;
  return {
    from: seg[1].toUpperCase(),
    to:   seg[2].toUpperCase(),
    service: (svc?.[1] ?? "FLIGHT").toUpperCase(),
    departureStr: dep?.[1]?.trim() ?? null,
  };
}

interface Leg {
  from: string; to: string; service: string; flightNo: string | null;
  atd: string | null; etd: string | null;
  ata: string | null; eta: string | null;
  pieces: string | null; weight: string | null;
  // All events for this leg (for milestone row)
  events: TrackingEvent[];
}

function buildLegs(allEvents: TrackingEvent[], origin: string, destination: string): Leg[] {
  // Only true ARR events create legs — RCF is a scan/receipt code, not a segment arrival
  // (El Al uses FOH/DIS/RCF/NFD/DLV; including RCF here causes phantom legs from ghost scans)
  const depEvs = allEvents.filter(e => e.status_code === "DEP");
  const arrEvs = allEvents.filter(e => ["ARR", "DLV"].includes(e.status_code ?? ""));

  // Try segment-remark pairing (Challenge, AFKLM, etc.)
  const arrByKey = new Map<string, TrackingEvent>();
  const depByKey = new Map<string, TrackingEvent>();
  for (const ev of arrEvs) {
    const s = parseSegmentRemark(ev.remarks);
    if (s) arrByKey.set(`${s.from}-${s.to}-${ev.flight || 'NOFLIGHT'}`, ev);
  }
  for (const ev of depEvs) {
    const s = parseSegmentRemark(ev.remarks);
    if (s) depByKey.set(`${s.from}-${s.to}-${ev.flight || 'NOFLIGHT'}`, ev);
  }

  const keys = new Set([...arrByKey.keys(), ...depByKey.keys()]);
  if (keys.size > 0) {
    const result: Leg[] = [];
    for (const key of keys) {
      const dep = depByKey.get(key);
      const arr = arrByKey.get(key);
      const seg = parseSegmentRemark(dep?.remarks ?? arr?.remarks) ?? { from: origin, to: destination, service: "FLIGHT" };
      result.push({
        from: seg.from, to: seg.to, service: seg.service,
        flightNo: dep?.flight ?? arr?.flight ?? null,
        atd: dep?.date ?? null, etd: seg.departureStr ?? null,
        ata: arr?.date ?? null, eta: null,
        pieces: dep?.pieces ?? arr?.pieces ?? null,
        weight: dep?.weight ?? arr?.weight ?? null,
        events: allEvents,
      });
    }
    result.sort((a, b) => new Date(a.atd ?? a.etd ?? "").getTime() - new Date(b.atd ?? b.etd ?? "").getTime());
    return result;
  }

  // Robust path reconstruction (handles missing/noisy scans dynamically)
  const safeTime = (d?: string | null) => d ? new Date(d).getTime() || 0 : 0;
  const chronoEvs = [...allEvents].sort((a, b) => safeTime(a.date) - safeTime(b.date));
  
  const path: string[] = [origin];
  for (const e of chronoEvs) {
     if (e.status_code === 'DEP' && e.location && e.location !== path[path.length - 1]) {
         path.push(e.location);
     }
  }
  // If the last arrival/delivery isn't the destination, add the destination.
  // Actually, always ensure the final node is the destination.
  if (path[path.length - 1] !== destination) {
       path.push(destination);
  }

  // De-duplicate any consecutive identical locations
  const purePath = path.filter((loc, i, arr) => i === 0 || loc !== arr[i-1]);

  const legs: Leg[] = [];
  for (let i = 0; i < purePath.length - 1; i++) {
     const pFrom = purePath[i];
     const pTo = purePath[i+1];
     
     // Find relevant events for this leg
     const lDep = chronoEvs.find(e => e.status_code === 'DEP' && e.location === pFrom);
     const lArr = chronoEvs.find(e => ['ARR','DLV'].includes(e.status_code || '') && e.location === pTo);
     
     legs.push({
         from: pFrom,
         to: pTo,
         service: "FLIGHT",
         flightNo: lDep?.flight || lArr?.flight || null,
         atd: lDep?.date || null,
         etd: null,
         ata: lArr?.date || null,
         eta: null,
         pieces: lDep?.pieces || lArr?.pieces || null,
         weight: lDep?.weight || lArr?.weight || null,
         events: allEvents
     });
  }
  
  if (legs.length === 0) {
      // Fallback 1 leg identical to origin->dest
      legs.push({
         from: origin, to: destination, service: "FLIGHT",
         flightNo: null, atd: null, etd: null, ata: null, eta: null,
         pieces: null, weight: null, events: allEvents
      });
  }

  return legs;
}

// ─── Milestone node card ────────────────────────────────────────────────────────

function MilestoneDatePair({ actual, estimated }: { actual?: string | null, estimated?: string | null }) {
  if (!actual && !estimated) return null;
  
  const hasAct = !!actual;
  const hasEst = !!estimated;
  
  // Normalize for comparison
  const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();
  const same = hasAct && hasEst && norm(actual) === norm(estimated);
  
  if (same || (hasAct && !hasEst)) {
     return (
       <span style={{ fontFamily: "monospace", fontSize: "0.63rem", color: C.green, textAlign: "center", lineHeight: 1.4, fontWeight: 600 }}>
         {fmtDate(actual)}
       </span>
     );
  }
  
  if (!hasAct && hasEst) {
     return (
       <span style={{ fontFamily: "monospace", fontSize: "0.63rem", color: C.amber, textAlign: "center", lineHeight: 1.4 }}>
         {fmtDate(estimated)}
       </span>
     );
  }
  
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
       <span style={{ fontFamily: "monospace", fontSize: "0.6rem", color: C.amber, opacity: 0.9 }}>
         {fmtDate(estimated)}
       </span>
       <span style={{ fontFamily: "monospace", fontSize: "0.63rem", color: C.green, fontWeight: 600 }}>
         {fmtDate(actual)}
       </span>
    </div>
  );
}

function MilestoneNode({
  code, label, desc, done, active, event,
}: {
  code: string; label: string; desc: string; done: boolean; active: boolean;
  event?: TrackingEvent | null;
}) {
  let actual = event?.date;
  let estimated = event?.estimated_date;
  
  if (code === "DEP" && !estimated) estimated = event?.departure_date;
  if (code === "ARR" && !estimated) estimated = event?.arrival_date;

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      minWidth: 100, maxWidth: 110, height: 230, // Fixed height container
    }}>
      {/* 1. Location / Station */}
      <div style={{ height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{
          fontFamily: "monospace", fontSize: "0.8rem", fontWeight: 700,
          color: done ? C.green : active ? C.amber : C.dim,
          letterSpacing: "0.05em",
        }}>
          {event?.location ?? "—"}
        </span>
      </div>

      {/* 2. Icon circle */}
      <div style={{ height: 62, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <MilestoneIcon code={code} done={done} active={active} />
      </div>

      {/* 3. Label (Milestone name) */}
      <div style={{ height: 38, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: "0.5rem" }}>
        <span style={{
          fontFamily: "monospace", fontSize: "0.75rem", fontWeight: 700,
          color: done ? C.green : active ? C.amber : C.dim,
          textAlign: "center", lineHeight: 1.2,
        }}>{label}</span>
      </div>

      {/* 4. Description & Flight number (Variable Middle) */}
      <div style={{ 
        flexGrow: 1, maxHeight: 50, // This section swallows the variability
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: "0.2rem", padding: "0 4px", overflow: "hidden"
      }}>
        <span style={{ fontSize: "0.6rem", color: C.dim2, textAlign: "center", lineHeight: 1.2 }}>
          {desc}
        </span>
        {event?.flight && (
          <span style={{
            fontFamily: "monospace", fontSize: "0.65rem", fontWeight: 600,
            color: C.accent, background: "rgba(59,130,246,0.12)",
            borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap"
          }}>{event.flight}</span>
        )}
      </div>

      {/* 5. Date (Anchor) */}
      <div style={{ height: 38, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <MilestoneDatePair actual={actual} estimated={estimated} />
      </div>

      {/* 6. Pieces (Bottom Anchor) */}
      <div style={{ height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {event?.pieces && (
          <span style={{ fontSize: "0.6rem", color: C.dim, fontWeight: 500 }}>
            {event.pieces} pcs
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Arrow connector ────────────────────────────────────────────────────────────

function Arrow({ done }: { done: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      flexShrink: 0, padding: "0 0.4rem",
      paddingBottom: "2.5rem", // offset to align with circles
    }}>
      <svg width="40" height="14" viewBox="0 0 40 14" fill="none">
        <line x1="0" y1="7" x2="34" y2="7" stroke={done ? C.green : C.connLine} strokeWidth="2" strokeDasharray={done ? "none" : "4 3"} />
        <polygon points="34,3 40,7 34,11" fill={done ? C.green : C.connLine} />
      </svg>
    </div>
  );
}

// ─── Unified Timeline Engine ────────────────────────────────────────────────────────

function UnifiedTimeline({ legs, events, origin, destination }: { legs: Leg[], events: TrackingEvent[], origin: string, destination: string }) {
  const elements = [];
  const presentCodes = new Set(events.map(e => e.status_code ?? ""));
  
  // 1. Origin: Ground services received
  const originFromCodes = ["BKD", "RCS", "FOH", "DIS", "130"]; 
  const originDone = originFromCodes.some(c => presentCodes.has(c));
  const originEv = events.find(e => originFromCodes.includes(e.status_code ?? ""));
  
  elements.push(
    <MilestoneNode 
      key="origin-ground"
      code="RCS" label="Ground service" desc={`Origin: ${origin}`}
      done={originDone} active={originDone && !presentCodes.has("DEP")}
      event={originEv ? { ...originEv, location: origin } as any : { location: origin } as any}
      
    />
  );
  
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const legEvents = leg.events.filter(e => {
      const locMatch = !e.location || e.location === leg.from || e.location === leg.to;
      const flightMatch = !e.flight || !leg.flightNo || e.flight === leg.flightNo;
      return locMatch && flightMatch;
    });
    const legCodes = new Set(legEvents.map(e => e.status_code ?? ""));

    const takeOffDone = legCodes.has("DEP") || legCodes.has("ARR") || legCodes.has("DLV") || presentCodes.has("ARR") || presentCodes.has("DLV");
    const depEv = legEvents.find(e => e.status_code === "DEP");
    const landingDone = legCodes.has("ARR") || legCodes.has("DLV") || presentCodes.has("DLV");
    const arrEv = legEvents.find(e => e.status_code === "ARR" || e.status_code === "DLV");

    // Take off
    elements.push(<Arrow key={`arr-dep-${i}`} done={takeOffDone} />);
    elements.push(
      <MilestoneNode 
        key={`takeoff-${i}`}
        code="DEP" label="Take off" desc={leg.flightNo ? `Flight ${leg.flightNo}` : "Flight"}
        done={takeOffDone} active={takeOffDone && !landingDone}
        event={depEv ? { ...depEv, location: leg.from } as any : { location: leg.from, date: leg.atd || leg.etd } as any}
        
      />
    );
    
    // Landing
    elements.push(<Arrow key={`arr-arr-${i}`} done={landingDone} />);
    elements.push(
      <MilestoneNode 
        key={`landing-${i}`}
        code="ARR" label="Landing" desc={`Arrived at ${leg.to}`}
        done={landingDone} active={landingDone && !presentCodes.has("DLV") && !presentCodes.has("AWD") && !(i < legs.length - 1)}
        event={arrEv ? { ...arrEv, location: leg.to } as any : { location: leg.to } as any}
        
      />
    );

    // If it's not the last leg, insert an intermediate "Ground service"
    if (i < legs.length - 1) {
       const transitCodes = ["RCF", "NFD", "RCS"];
       const transitEvs = events.filter(e => e.location === leg.to);
       const tCodes = new Set(transitEvs.map(e => e.status_code ?? ""));
       // Done if we have a transit scanner code, or if the next flight has departed!
       const nextLegTakeOff = presentCodes.has("DEP"); // simplified
       const transitDone = transitCodes.some(c => tCodes.has(c)) || landingDone; 
       const transitEv = transitEvs.find(e => transitCodes.includes(e.status_code ?? ""));

       elements.push(<Arrow key={`arr-transit-${i}`} done={transitDone} />);
       elements.push(
         <MilestoneNode 
           key={`transit-ground-${i}`}
           code="RCF" label="Ground service" desc={`Transit: ${leg.to}`}
           done={transitDone} active={transitDone && !nextLegTakeOff}
           event={transitEv ? { ...transitEv, location: leg.to } as any : { location: leg.to } as any}
           
         />
       );
    }
  }
  
  // Final Node: Ground service delivered
  const destDone = ["DLV", "AWD"].some(c => presentCodes.has(c));
  const destEv = events.find(e => ["DLV"].includes(e.status_code ?? "")) ?? events.find(e => ["AWD"].includes(e.status_code ?? ""));
  
  if (legs.length > 0) {
    elements.push(<Arrow key={`arr-dest`} done={destDone} />);
    elements.push(
      <MilestoneNode 
        key="dest-ground"
        code="DLV" label="Ground service" desc="Final Delivery"
        done={destDone} active={destDone}
        event={destEv ? { ...destEv, location: destination } as any : { location: destination } as any}
        
      />
    );
  }
  
  return (
    <div style={{
      padding: "3rem 1.5rem",
      backgroundColor: C.bgCard,
      overflowX: "auto",
      width: "100%",
    }}>
      {legs.length > 0 ? (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 0, minWidth: "max-content", margin: "0 auto" }}>
           {elements}
        </div>
      ) : (
        <div style={{ textAlign: "center", color: C.dim }}>
          Awaiting airline updates...
        </div>
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

interface Props { data: TrackingResponse }

export default function MilestonePlan({ data }: Props) {
  const events = data.events ?? [];
  
  function cleanCity(loc?: string | null): string | null {
    if (!loc || loc === "???") return null;
    return loc.replace(/\s*\(MAMAN\)/i, "").replace(/\s*\(Swissport\)/i, "").trim().toUpperCase();
  }

  let origin = cleanCity(data.origin);
  let destination = cleanCity(data.destination);

  if (!origin) {
    const firstWithLoc = [...events].sort((a,b) => new Date(a.date||0).getTime() - new Date(b.date||0).getTime()).find(e => cleanCity(e.location));
    origin = firstWithLoc ? cleanCity(firstWithLoc.location) : "???";
  }

  if (!destination) {
    const lastWithLoc = [...events].sort((a,b) => new Date(b.date||0).getTime() - new Date(a.date||0).getTime()).find(e => cleanCity(e.location));
    destination = lastWithLoc ? cleanCity(lastWithLoc.location) : "???";
  }
  
  origin = origin || "???";
  destination = destination || "???";

  // Ground events (Maman / Swissport — have source tag)
  const groundEvents = events.filter(e =>
    (e as any).source === "maman" || (e as any).source === "swissport" ||
    (e.location?.includes("MAMAN") || e.location?.includes("Swissport"))
  );

  // Airline events
  const airlineEvents = events.filter(e => !groundEvents.includes(e));

  const legs = buildLegs(airlineEvents.length > 0 ? airlineEvents : events, origin, destination);

  const isDlv = events.some(e => e.status_code === "DLV") || data.status === "Delivered";
  const isErr = data.status === "Partial/Ground Error" || data.status === "Error";

  // Latest status: prioritize DLV, else last airline event status
  const overallStatus = isDlv
    ? "Delivered"
    : events.find(e => e.status_code === "DEP")?.status ?? data.status ?? "In progress";

  const statusColor = isDlv ? C.green : isErr ? C.amber : C.accent;

  const hasMaman = groundEvents.some(e => e.location?.includes("MAMAN") || (e as any).source === "maman");
  const hasSwissport = groundEvents.some(e => e.location?.includes("Swissport") || (e as any).source === "swissport");
  const groundHolders = [];
  if (hasMaman) groundHolders.push("Maman");
  if (hasSwissport) groundHolders.push("Swissport");
  const groundNames = groundHolders.join(" & ");

  return (
    <div style={{
      background: C.bg,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      overflow: "hidden",
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    }}>
      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "1rem 1.5rem",
        borderBottom: `1px solid ${C.border}`,
        background: C.bgCard,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: "1.1rem", color: "#fff" }}>
            {origin}
          </span>
          <span style={{ color: C.accent, fontSize: "1.3rem" }}>→</span>
          <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: "1.1rem", color: "#fff" }}>
            {destination}
          </span>
          <span style={{ fontSize: "0.7rem", color: C.dim2, marginLeft: 6 }}>
            {legs.length} leg{legs.length !== 1 ? "s" : ""}
          </span>
          
          {data.airline && (
            <span style={{
              marginLeft: "0.8rem",
              fontSize: "0.7rem",
              fontWeight: 700,
              backgroundColor: "rgba(59, 130, 246, 0.15)",
              color: C.accent,
              padding: "3px 8px",
              borderRadius: "6px",
              letterSpacing: "0.02em"
            }}>
              {data.airline.toUpperCase()}
            </span>
          )}
          
          {groundNames && (
            <span style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              backgroundColor: "rgba(240, 180, 41, 0.15)",
              color: C.amber,
              padding: "3px 8px",
              borderRadius: "6px",
              letterSpacing: "0.02em"
            }}>
              {groundNames.toUpperCase()}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          {isDlv
            ? <CheckCircle size={15} color={C.green} />
            : <Clock size={15} color={C.accent} />}
          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: statusColor }}>
            {overallStatus}
          </span>
        </div>
      </div>

      {/* ── Main body: Unified Timeline Flow ── */}
      <UnifiedTimeline legs={legs} events={events} origin={origin} destination={destination} />
      
    </div>
  );
}
