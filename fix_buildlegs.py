import re
with open("frontend/src/components/MilestonePlan.tsx", "r") as f:
    text = f.read()

# We need to replace everything starting from "// Advanced chronological pairing" 
# to the end of `buildLegs` function before `// ─── Milestone node card`
# We'll use regex to match from the fallback down to the return statement.

match_pattern = r'  // Advanced chronological pairing.*?return \[\{\n.*?\}\];\n\}'

new_code = """  // Robust path reconstruction (handles missing/noisy scans dynamically)
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
}"""

# Since I just applied the update previously, my `text` now has `// Advanced chronological pairing`
# Let's verify and replace!
text = re.sub(match_pattern, new_code, text, flags=re.MULTILINE|re.DOTALL)

with open("frontend/src/components/MilestonePlan.tsx", "w") as f:
    f.write(text)
