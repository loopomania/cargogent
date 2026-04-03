import re

with open("/Users/alonmarom/dev/cargogent/frontend/src/components/MilestonePlan.tsx", "r") as f:
    code = f.read()

# Replace everything from GroundPanel down to the end of the file.
pattern = r"// ─── Ground panel ───────────────────────────────────────────────────────────────.*$}?"
# Actually we can just locate the GroundPanel comment
parts = code.split("// ─── Ground panel ───────────────────────────────────────────────────────────────")

new_bottom = """// ─── Unified Timeline Engine ────────────────────────────────────────────────────────

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
      code="RCS" label="Ground services received" desc={`Origin: ${origin}`}
      done={originDone} active={originDone && !presentCodes.has("DEP")}
      event={originEv ? { ...originEv, location: origin } as any : { location: origin } as any}
    />
  );
  
  let previousWasDone = originDone;
  
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
        event={depEv ? { ...depEv, location: leg.from } as any : { location: leg.from } as any}
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

    // If it's not the last leg, insert an intermediate "Ground services received"
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
           code="RCF" label="Ground services received" desc={`Transit: ${leg.to}`}
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
        code="DLV" label="Ground service delivered" desc="Final Delivery"
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
        <div style={{ display: "flex", alignItems: "flex-start", gap: 0, minWidth: "max-content", margin: "0 auto", paddingLeft: "1rem", paddingRight: "1rem" }}>
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
  const origin      = data.origin ?? "???";
  const destination = data.destination ?? "???";

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
"""

with open("/Users/alonmarom/dev/cargogent/frontend/src/components/MilestonePlan.tsx", "w") as f:
    f.write(parts[0] + new_bottom)
