
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
  
  // ISO: 2026-03-03T08:57:09 or 2026-03-03 08:57:09
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (iso) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${iso[3]} ${months[parseInt(iso[2])-1]} ${iso[1].slice(2)} ${iso[4]}:${iso[5]}`;
  }

  // DD MON HH:MM (Lufthansa) -> 27 FEB 13:34
  const luf = raw.match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{2}:\d{2})/i);
  if (luf) {
    return `${luf[1].padStart(2, '0')} ${luf[2]} 26 ${luf[3]}`;
  }

  // DD MON YY HH:MM or DD MON YYYY HH:MM
  const ddmon = raw.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})(?:\s+(\d{2}:\d{2}))?/i);
  if (ddmon) {
    const d = ddmon[1].padStart(2, '0');
    const m = ddmon[2];
    const y = ddmon[3].length === 4 ? ddmon[3].slice(2) : ddmon[3];
    const t = ddmon[4] ?? "";
    return t ? `${d} ${m} ${y} ${t}` : `${d} ${m} ${y}`;
  }

  // DD/MM/YY HH:MM
  const ddmmyy = raw.match(/^(\d{2})\/(\d{2})\/(\d{2})\s*(\d{2}:\d{2})?/);
  if (ddmmyy) {
    const months = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${ddmmyy[1]} ${months[parseInt(ddmmyy[2])]} ${ddmmyy[3]}` + (ddmmyy[4] ? ` ${ddmmyy[4]}` : "");
  }

  return raw.length > 20 ? raw.slice(0, 20) : raw;
}

// ─── Milestone definitions ──────────────────────────────────────────────────────

const safeTime = (e?: TrackingEvent | null) => {
  const d = e?.date || e?.estimated_date;
  return d ? new Date(d).getTime() || 0 : 0;
};

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

function buildLegs(allEvents: TrackingEvent[], origin: string, destination: string, excelLegs: any[] = []): Leg[] {
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

  // Robust flight-based path reconstruction (supports split shipments)
  const chronoEvs = [...allEvents].sort((a, b) => safeTime(a) - safeTime(b));
  
  // Find all distinct flights mentioned in DEP or ARR events
  const flightNumbers = Array.from(new Set(
    chronoEvs
      .filter(e => ['DEP', 'ARR', 'DLV'].includes(e.status_code || '') && e.flight)
      .map(e => e.flight!)
  ));

  const legs: Leg[] = [];

  if (flightNumbers.length > 0) {
    // For each distinct flight, build its specific route
    for (const flt of flightNumbers) {
      const fltEvs = chronoEvs.filter(e => e.flight === flt);
      const fltPath: string[] = [];
      
      const firstDepLoc = cleanCity(fltEvs.find(e => e.status_code === 'DEP')?.location);
      if (firstDepLoc) {
        fltPath.push(firstDepLoc);
      } else if (cleanCity(origin)) {
        fltPath.push(cleanCity(origin)!);
      }

      for (const e of fltEvs) {
        const loc = cleanCity(e.location);
        if (loc && loc !== fltPath[fltPath.length - 1] && (e.status_code === 'DEP' || e.status_code === 'ARR')) {
          fltPath.push(loc);
        }
      }

      const pureFltPath = fltPath.filter((loc, i, arr) => i === 0 || loc !== arr[i-1]);

      if (pureFltPath.length === 1 && cleanCity(destination)) {
         if (pureFltPath[0] !== cleanCity(destination)) {
             pureFltPath.push(cleanCity(destination)!);
         }
      }

      for (let i = 0; i < pureFltPath.length - 1; i++) {
        const pFrom = pureFltPath[i];
        const pTo = pureFltPath[i+1];
        
        legs.push({
           from: pFrom,
           to: pTo,
           service: "FLIGHT",
           flightNo: flt,
           atd: null, etd: null, ata: null, eta: null, pieces: null, weight: null,
           events: allEvents
        });
      }
    }
  }

  // If no flight numbers found, or no legs generated, fallback to the old linear chronological path
  if (legs.length === 0) {
      const path: string[] = [cleanCity(origin) || origin];
      for (const e of chronoEvs) {
         const loc = cleanCity(e.location);
         if (e.status_code === 'DEP' && loc && loc !== path[path.length - 1]) {
             path.push(loc);
         }
      }
      if (cleanCity(destination) && path[path.length - 1] !== cleanCity(destination)) {
           path.push(cleanCity(destination)!);
      }
      const purePath = path.filter((loc, i, arr) => i === 0 || loc !== arr[i-1]);
      for (let i = 0; i < purePath.length - 1; i++) {
         legs.push({
             from: purePath[i],
             to: purePath[i+1],
             service: "FLIGHT",
             flightNo: null,
             atd: null, etd: null, ata: null, eta: null, pieces: null, weight: null,
             events: allEvents
         });
      }
  }

  // Merge Excel segments into the path if they add new information
  for (const xl of excelLegs) {
      const xFrom = cleanCity(xl.from);
      const xTo = cleanCity(xl.to);
      const exists = legs.some(l => l.from === xFrom && l.to === xTo);
      if (!exists && xFrom && xTo) {
         legs.push({
             from: xFrom,
             to: xTo,
             service: "FLIGHT",
             flightNo: xl.flight || null,
             atd: null, etd: null, ata: null, eta: null, pieces: null, weight: null,
             events: allEvents
         });
      }
  }

  // Sort all legs chronologically based on their first DEP or ARR event
  legs.sort((a, b) => {
    const aEv = allEvents.find(e => (e.flight === a.flightNo || !a.flightNo) && (cleanCity(e.location) === a.from || cleanCity(e.location) === a.to));
    const bEv = allEvents.find(e => (e.flight === b.flightNo || !b.flightNo) && (cleanCity(e.location) === b.from || cleanCity(e.location) === b.to));
    return safeTime(aEv) - safeTime(bEv);
  });
  
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

function MilestoneDatePair({ actual, estimated, code }: { actual?: string | null, estimated?: string | null, code: string }) {
  const hasAct = !!actual;
  const hasEst = !!estimated;
  
  if (!hasAct && !hasEst) return null;

  // Normalize for comparison
  const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();
  const same = hasAct && hasEst && norm(actual) === norm(estimated);

  const aLbl = code === "DEP" ? "ATD" : code === "ARR" ? "ATA" : "ACT";
  const eLbl = code === "DEP" ? "ETD" : code === "ARR" ? "ETA" : "EST";

  if (same || (hasAct && !hasEst)) {
     return (
       <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, whiteSpace: "nowrap" }}>
         <span style={{ fontFamily: "monospace", fontSize: "0.63rem", color: C.green, textAlign: "center", lineHeight: 1.2, fontWeight: 600 }}>
           <span style={{ color: C.dim, fontSize: "0.55rem", marginRight: 4 }}>{aLbl}</span>
           {fmtDate(actual)}
         </span>
       </div>
     );
  }
  
  if (!hasAct && hasEst) {
     return (
       <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, whiteSpace: "nowrap" }}>
         <span style={{ fontFamily: "monospace", fontSize: "0.63rem", color: C.amber, textAlign: "center", lineHeight: 1.2 }}>
           <span style={{ color: C.dim, fontSize: "0.55rem", marginRight: 4 }}>{eLbl}</span>
           {fmtDate(estimated)}
         </span>
       </div>
     );
  }
  
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, whiteSpace: "nowrap" }}>
       <span style={{ fontFamily: "monospace", fontSize: "0.6rem", color: C.amber, opacity: 0.9 }}>
         <span style={{ color: C.dim, fontSize: "0.55rem", marginRight: 4 }}>{eLbl}</span>
         {fmtDate(estimated)}
       </span>
       <span style={{ fontFamily: "monospace", fontSize: "0.63rem", color: C.green, fontWeight: 600 }}>
         <span style={{ color: C.dim, fontSize: "0.55rem", marginRight: 4 }}>{aLbl}</span>
         {fmtDate(actual)}
       </span>
    </div>
  );
}

function MilestoneNode({
  code, label, desc, done, active, event, excelEtd, excelEta
}: {
  code: string; label: string; desc: string; done: boolean; active: boolean;
  event?: TrackingEvent | null;
  excelEtd?: string | null;
  excelEta?: string | null;
}) {
  let actual = event?.date;
  let estimated = event?.estimated_date;
  
  if (code === "DEP" && !estimated) estimated = event?.departure_date;
  if (code === "ARR" && !estimated) estimated = event?.arrival_date;

  // If we are a DEP node but the event is a pre-departure event like RCS or MAN, its date is NOT an actual departure time
  if (code === "DEP" && event && ["RCS", "MAN", "BKD", "FOH", "DIS"].includes(event.status_code ?? "")) {
    actual = undefined;
    if (event.status_code === "BKD" && !estimated) {
      estimated = event.date || event.estimated_date;
    }
  }

  const trackerFinalDate = actual || estimated;
  
  const getDiffColor = (xlsDate?: string | null, trkDate?: string | null) => {
     if (!xlsDate) return C.dim2; 
     if (!trkDate) return C.dim; 
     const diff = Math.abs(new Date(xlsDate).getTime() - new Date(trkDate).getTime());
     return (diff > 3600000) ? C.red : C.green;
  };

  const hasExcelSlot = excelEtd !== undefined || excelEta !== undefined;
  const xlType = excelEtd !== undefined ? "EDT" : "ETA";
  const xlDate = excelEtd !== undefined ? excelEtd : excelEta;
  const xlColor = getDiffColor(xlDate, trackerFinalDate);

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      minWidth: 100, maxWidth: 110, height: hasExcelSlot ? 260 : 230, // Increased height
    }}>
      {/* 1. Location / Station */}
      <div style={{ height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{
          fontFamily: "monospace", fontSize: "0.8rem", fontWeight: 700,
          color: done ? C.green : active ? C.amber : C.dim,
          letterSpacing: "0.05em",
        }}>
          {(event?.location ? cleanCity(event.location) : null) ?? "—"}
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
        <MilestoneDatePair actual={actual} estimated={estimated} code={code} />
      </div>

      {/* 6. Pieces (Bottom Anchor) */}
      <div style={{ height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {event?.pieces && (
          <span style={{ fontSize: "0.6rem", color: C.dim, fontWeight: 500 }}>
            {event.pieces} pcs
          </span>
        )}
      </div>

      {/* 7. Excel Dates (New Bottom Anchor) */}
      {hasExcelSlot && (
         <div style={{ height: 30, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", marginTop: "auto" }}>
            <span style={{ fontSize: "0.55rem", color: C.dim }}>Excel {xlType}</span>
            <span style={{ fontSize: "0.6rem", color: xlDate ? xlColor : C.dim2, fontWeight: 600 }}>{xlDate ? fmtDate(xlDate) : "---"}</span>
         </div>
      )}
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

function UnifiedTimeline({ legs, events, origin, destination, excelLegs }: { legs: Leg[], events: TrackingEvent[], origin: string, destination: string, excelLegs: any[] }) {
  const elements = [];
  const presentCodes = new Set(events.map(e => e.status_code ?? ""));
  
  // 1. Origin: Ground services received
  const originFromCodes = ["BKD", "RCS", "FOH", "DIS", "130"]; 
  const originDone = originFromCodes.some(c => presentCodes.has(c));
  // Prioritize events with a date, as some airlines emit "ghost" scans with no date first
  const originEv = events.find(e => originFromCodes.includes(e.status_code ?? "") && (e.date || e.departure_date)) 
                || events.find(e => originFromCodes.includes(e.status_code ?? ""));
  
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
    const xlLeg = excelLegs.find(xl => xl.from === leg.from && xl.to === leg.to) || excelLegs[i];
    const xlEtd = xlLeg?.etd;
    const xlEta = xlLeg?.eta;

    const legEvents = leg.events.filter(e => {
      const isMatch = (target: string) => {
        if (!target) return true;
        const upperLoc = (e.location || "").toUpperCase();
        const upperTarget = target.toUpperCase();
        if (!upperLoc) return true;
        if (cleanCity(e.location) === upperTarget) return true;
        if (upperLoc.startsWith(upperTarget)) return true;
        const regex = new RegExp(`\\b${upperTarget}\\b`);
        if (regex.test(upperLoc)) return true;
        return false;
      };
      
      const locMatch = isMatch(leg.from) || isMatch(leg.to);
      const flightMatch = !e.flight || !leg.flightNo || e.flight === leg.flightNo;
      return locMatch && flightMatch;
    });

    const takeOffDone = legEvents.some(e => e.status_code === "DEP" && e.date) || legEvents.some(e => ["ARR", "DLV"].includes(e.status_code||"") && e.date) || events.some(e => ["ARR", "DLV"].includes(e.status_code||"") && e.date);
    const landingDone = legEvents.some(e => ["ARR", "DLV"].includes(e.status_code||"") && e.date) || events.some(e => e.status_code === "DLV" && e.date);
    
    // depEv prefers an actual DEP event, else any DEP, else BKD/RCS/MAN
    const depEv = legEvents.find(e => e.status_code === "DEP" && e.date) || legEvents.find(e => e.status_code === "DEP") || legEvents.find(e => e.status_code === "BKD") || legEvents.find(e => ["MAN", "RCS"].includes(e.status_code ?? ""));
    const arrEv = legEvents.find(e => ["ARR", "DLV", "RCT"].includes(e.status_code ?? "") && e.date) || legEvents.find(e => ["ARR", "DLV", "RCT"].includes(e.status_code ?? ""));

    // Take off
    elements.push(<Arrow key={`arr-dep-${i}`} done={takeOffDone} />);
    elements.push(
      <MilestoneNode 
        key={`takeoff-${i}`}
        code="DEP" label="Take off" desc={leg.flightNo ? `Flight ${leg.flightNo}` : "Flight"}
        done={takeOffDone} active={takeOffDone && !landingDone}
        event={depEv ? { ...depEv, location: leg.from } as any : { location: leg.from, date: leg.atd || leg.etd } as any}
        excelEtd={xlEtd}
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
        excelEta={xlEta}
      />
    );

    // If it's not the last leg, insert an intermediate "Ground service"
    if (i < legs.length - 1) {
       const transitCodes = ["RCF", "NFD", "RCS", "RCT", "ARR"];
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

function cleanCity(loc?: string | null): string | null {
  if (!loc || loc === "???") return null;
  const match = loc.match(/\(([A-Za-z]{3})\)/);
  if (match) return match[1].toUpperCase();

  let clean = loc.replace(/\s*\([^)]*\)/g, "").trim().toUpperCase();
  if (clean.length === 5 && !clean.includes(" ")) {
    clean = clean.substring(2);
  }
  return clean;
}

export default function MilestonePlan({ data }: Props) {
  const events = data.events ?? [];
  
  let origin = cleanCity(data.origin);
  let destination = cleanCity(data.destination);

  // Fallback 1: Prefer Excel data if available and tracker data is missing
  const excelLegs = (data.raw_meta?.excel_legs as any[]) || [];
  if (!origin && excelLegs.length > 0) {
    origin = cleanCity(excelLegs[0].from);
  }
  if (!destination && excelLegs.length > 0) {
    destination = cleanCity(excelLegs[excelLegs.length - 1].to);
  }

  // Fallback 2: Last resort — scan events
  if (!origin) {
    const firstWithLoc = [...events].sort((a,b) => safeTime(a) - safeTime(b)).find(e => cleanCity(e.location));
    origin = firstWithLoc ? cleanCity(firstWithLoc.location) : "???";
  }

  if (!destination) {
    const lastWithLoc = [...events]
      .sort((a,b) => safeTime(b) - safeTime(a))
      .find(e => {
        const loc = cleanCity(e.location);
        if (!loc) return false;
        // Don't pick the origin as destination if it's just a departure scan
        if (origin && loc === origin && (e.status_code === 'DEP' || e.status_code === 'RCS')) return false;
        return true;
      });
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

  const legs = buildLegs(airlineEvents.length > 0 ? airlineEvents : events, origin, destination, excelLegs);

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
        display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.6rem",
        padding: "1rem 1.5rem",
        borderBottom: `1px solid ${C.border}`,
        background: C.bgCard,
      }}>
        <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: "1.1rem", color: "#fff" }}>
          {origin}
        </span>
        <span style={{ color: C.accent, fontSize: "1.3rem" }}>→</span>
        <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: "1.1rem", color: "#fff" }}>
          {destination}
        </span>
        <span style={{ fontSize: "0.7rem", color: C.dim2 }}>
          {legs.length} leg{legs.length !== 1 ? "s" : ""}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          {data.airline && (
            <span style={{
              fontSize: "0.7rem", fontWeight: 700,
              backgroundColor: "rgba(59, 130, 246, 0.15)", color: C.accent,
              padding: "3px 8px", borderRadius: "6px", letterSpacing: "0.02em"
            }}>
              {data.airline.toUpperCase()}
            </span>
          )}

          {groundNames && (
            <span style={{
              fontSize: "0.7rem", fontWeight: 700,
              backgroundColor: "rgba(240, 180, 41, 0.15)", color: C.amber,
              padding: "3px 8px", borderRadius: "6px", letterSpacing: "0.02em"
            }}>
              {groundNames.toUpperCase()}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginLeft: "0.4rem" }}>
          {isDlv
            ? <CheckCircle size={15} color={C.green} />
            : <Clock size={15} color={C.accent} />}
          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: statusColor }}>
            {overallStatus}
          </span>
        </div>
      </div>

      {/* ── Main body: Unified Timeline Flow ── */}
      <UnifiedTimeline legs={legs} events={events} origin={origin} destination={destination} excelLegs={excelLegs} />
      
      {/* ── Legend ── */}
      <div style={{
        display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: "1rem",
        padding: "0.8rem 1.5rem", borderTop: `1px solid ${C.border}`,
        backgroundColor: C.bgCard, fontSize: "0.75rem", fontFamily: "monospace"
      }}>
        <div style={{ display: "flex", gap: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: C.amber }} />
            <span style={{ color: C.dim }}>Estimated</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: C.green }} />
            <span style={{ color: C.dim }}>Actual</span>
          </div>
        </div>
      </div>
    </div>
  );
}
