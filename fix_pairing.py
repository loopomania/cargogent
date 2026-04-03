import re
with open("frontend/src/components/MilestonePlan.tsx", "r") as f:
    text = f.read()

old_pairing = """  // Simple pairing by index (when DEP/ARR follow the location)
  if (depEvs.length > 0 || arrEvs.length > 0) {
    // Sort oldest-first to pair chronological legs correctly
    const sDep = [...depEvs].sort((a,b) => new Date(a.date || "").getTime() - new Date(b.date || "").getTime());
    const sArr = [...arrEvs].sort((a,b) => new Date(a.date || "").getTime() - new Date(b.date || "").getTime());

    const legs: Leg[] = [];
    const maxLen = Math.max(sDep.length, sArr.length, 1);
    for (let i = 0; i < maxLen; i++) {
      const dep = sDep[i] ?? null;
      const arr = sArr[i] ?? null;
      legs.push({
        from: dep?.location ?? origin,
        to:   arr?.location ?? destination,
        service: "FLIGHT",
        flightNo: dep?.flight ?? arr?.flight ?? null,
        atd: dep?.date ?? null, etd: null,
        ata: arr?.date ?? null, eta: null,
        pieces: dep?.pieces ?? arr?.pieces ?? null,
        weight: dep?.weight ?? arr?.weight ?? null,
        events: allEvents,
      });
    }
    legs.sort((a, b) => new Date(a.atd ?? "").getTime() - new Date(b.atd ?? "").getTime());
    return legs;
  }"""

new_pairing = """  // Advanced chronological pairing (handles missing ARR scans dynamically)
  if (depEvs.length > 0 || arrEvs.length > 0) {
    const safeTime = (d?: string | null) => d ? new Date(d).getTime() || 0 : 0;
    const sDep = [...depEvs].sort((a, b) => safeTime(a.date) - safeTime(b.date));
    const sArr = [...arrEvs].sort((a, b) => safeTime(a.date) - safeTime(b.date));

    const legs: Leg[] = [];

    if (sDep.length > 0) {
      for (let i = 0; i < sDep.length; i++) {
        const dep = sDep[i];
        
        // Predict the destination of this leg by looking at the *next* departure!
        let toLocation = destination;
        if (i < sDep.length - 1 && sDep[i+1].location) {
          toLocation = sDep[i+1].location as string;
        } else if (sArr.length > 0 && sArr[sArr.length - 1].location) {
          toLocation = sArr[sArr.length - 1].location as string;
        }

        const arr = sArr.find(a => a.location === toLocation) || sArr[i] || null;

        legs.push({
          from: dep.location || origin,
          to: toLocation,
          service: "FLIGHT",
          flightNo: dep.flight || arr?.flight || null,
          atd: dep.date || null,
          etd: null,
          ata: arr?.date || null,
          eta: null,
          pieces: dep.pieces || arr?.pieces || null,
          weight: dep.weight || arr?.weight || null,
          events: allEvents,
        });
      }
    } else {
      // Edge case: ARR exists, but no DEP
      legs.push({
        from: origin,
        to: sArr[0]?.location || destination,
        service: "FLIGHT",
        flightNo: sArr[0]?.flight || null,
        atd: null, etd: null,
        ata: sArr[0]?.date || null, eta: null,
        pieces: sArr[0]?.pieces || null, weight: sArr[0]?.weight || null,
        events: allEvents
      });
    }

    return legs;
  }"""

text = text.replace(old_pairing, new_pairing)

# Also fix the issue we had where `UnifiedTimeline` passes `({ location: leg.from } as any)`
# We should give it the actual leg.from so it doesn't say "undefined" if there's no location.
with open("frontend/src/components/MilestonePlan.tsx", "w") as f:
    f.write(text)
