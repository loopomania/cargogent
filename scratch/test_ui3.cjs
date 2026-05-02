function cleanCity(loc) {
  if (!loc || loc === "???") return null;
  const match = loc.match(/\(([A-Za-z]{3})\)/);
  if (match) return match[1].toUpperCase();

  let clean = loc.replace(/\s*\([^)]*\)/g, "").trim().toUpperCase();
  if (clean.length === 5 && !clean.includes(" ")) {
    clean = clean.substring(2);
  }
  return clean;
}

const legs = [
  { from: 'TLV', to: 'ATH', flightNo: 'LY843' },
  { from: 'TLV', to: 'ATH', flightNo: 'LY845' },
  { from: 'ATH', to: 'YYZ', flightNo: 'AC123' }
];

function buildFlows(legs, origin) {
  if (legs.length === 0) return [];
  
  let starts = legs.filter(l => cleanCity(l.from) === cleanCity(origin));
  if (starts.length === 0) {
    const allTos = new Set(legs.map(l => cleanCity(l.to)));
    const noPreds = legs.filter(l => !allTos.has(cleanCity(l.from)));
    starts.push(...(noPreds.length > 0 ? noPreds : [legs[0]]));
  }

  const flows = [];

  function traverse(currentPath) {
    const lastLeg = currentPath[currentPath.length - 1];
    const nextLegs = legs.filter(l => cleanCity(l.from) === cleanCity(lastLeg.to) && !currentPath.includes(l));
    
    if (nextLegs.length === 0) {
      flows.push(currentPath);
    } else {
      for (const next of nextLegs) {
        traverse([...currentPath, next]);
      }
    }
  }

  for (const start of starts) {
    traverse([start]);
  }

  return flows;
}

const flows = buildFlows(legs, 'TLV');
console.log(JSON.stringify(flows, null, 2));
