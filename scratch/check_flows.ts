import fs from 'fs';

// Dump the exact logic here
function cleanCity(loc?: string | null) {
  if (!loc) return undefined;
  const s = loc.replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (s.startsWith("US") && s.length === 5) return s.substring(2);
  if (s.startsWith("IL") && s.length === 5) return s.substring(2);
  if (s.startsWith("GB") && s.length === 5) return s.substring(2);
  if (s.startsWith("DE") && s.length === 5) return s.substring(2);
  if (s.startsWith("FR") && s.length === 5) return s.substring(2);
  return s.substring(0,3); // naive
}

const origin = "TLV";
const destination = "DFW";
const excelLegs = [
  {from: "ILTLV", to: "USJFK", flight: null, etd: "2026-04-19T09:20:00.000Z", eta: null},
  {from: "USJFK", to: "USEWR", flight: null, etd: null, eta: null},
  {from: "USEWR", to: "USDFW", flight: null, etd: null, eta: "2026-04-27T10:00:00.000Z"}
];

// Reconstruct chronoEvs
const chronoEvs = [
  {status_code: 'BKD', location: 'TLV', date: '2026-04-19T09:42:53.000Z', flight: 'IZ0995'},
  {status_code: 'MAN', location: 'JFK', date: '2026-04-21T14:00:00.000Z', flight: 'UA4057T'},
  {status_code: 'DEP', location: 'JFK', date: '2026-04-21T18:34:00.000Z', flight: 'UA4057T'},
  {status_code: 'ARR', location: 'EWR', date: '2026-04-21T20:17:39.000Z', flight: 'UA4057T'},
  {status_code: 'RCT', location: 'JFK', date: '2026-04-21T20:55:54.000Z', flight: 'IZ0995'},
  {status_code: 'BKD', location: 'JFK', date: '2026-04-21T20:58:59.000Z', flight: 'UA4057T'},
  {status_code: 'RCF', location: 'EWR', date: '2026-04-21T22:15:13.000Z', flight: 'UA4057T'},
  {status_code: 'AWR', location: 'EWR', date: '2026-04-21T23:13:00.000Z', flight: 'UA4057T'},
  {status_code: 'BKD', location: 'EWR', date: '2026-04-23T02:29:17.000Z', flight: 'UA1200T'},
  {status_code: 'MAN', location: 'EWR', date: '2026-04-23T10:43:00.000Z', flight: 'UA1200T'},
  {status_code: 'DEP', location: 'EWR', date: '2026-04-23T20:05:00.000Z', flight: 'UA1200T'},
  {status_code: 'ARR', location: 'DFW', date: '2026-04-25T12:32:04.000Z', flight: 'UA1200T'},
  {status_code: 'RCF', location: 'DFW', date: '2026-04-25T14:11:13.000Z', flight: 'UA1200T'},
];

function normalizeFlight(f) {
  if (!f) return null;
  const m = f.replace(/\s+/g, '').toUpperCase().match(/^([A-Z]{2,3})0*(\d{1,4})$/);
  return m ? `${m[1]}${m[2]}` : f.replace(/\s+/g, '').toUpperCase();
}

const cycleOrder = { "BKD": 1, "RCS": 2, "FOH": 2, "DIS": 2, "MAN": 3, "DEP": 4, "ARR": 5, "RCF": 6, "NFD": 7, "AWD": 8, "DLV": 9 };

const legs = [];
const uniqueNormFlights = Array.from(new Set(chronoEvs.filter(e => e.flight).map(e => normalizeFlight(e.flight))));

for (const norm of uniqueNormFlights) {
      if (!norm) continue;
      const evs = chronoEvs.filter(e => normalizeFlight(e.flight) === norm);
      
      const flightInstances = [];
      let currentInstance = [];
      let maxCycleSoFar = -1;
      
      for (const e of evs) {
          const idx = cycleOrder[e.status_code || ""] || 0;
          if ((idx === 3 || idx === 4) && maxCycleSoFar >= 5) {
              flightInstances.push(currentInstance);
              currentInstance = [];
              maxCycleSoFar = -1;
          }
          currentInstance.push(e);
          if (idx > maxCycleSoFar) maxCycleSoFar = idx;
      }
      if (currentInstance.length > 0) flightInstances.push(currentInstance);

      for (let instIdx = 0; instIdx < flightInstances.length; instIdx++) {
          const fltEvs = flightInstances[instIdx];
          const fltStr = fltEvs.find(e => e.flight)?.flight || norm;
          const fltPath = [];
          
          const firstDepLoc = cleanCity(fltEvs.find(e => e.status_code === 'DEP')?.location);
          if (firstDepLoc) {
            fltPath.push(firstDepLoc);
          } else if (cleanCity(origin)) {
            fltPath.push(cleanCity(origin));
          }

          for (const e of fltEvs) {
            const loc = cleanCity(e.location);
            if (loc && loc !== fltPath[fltPath.length - 1] && (e.status_code === 'DEP' || e.status_code === 'ARR')) {
              fltPath.push(loc);
            }
          }

          const pureFltPath = fltPath.filter((loc, i, arr) => i === 0 || loc !== arr[i-1]);

          if (pureFltPath.length === 1) {
             const lastLoc = cleanCity([...fltEvs].reverse().find(e => cleanCity(e.location) && cleanCity(e.location) !== pureFltPath[0])?.location);
             if (lastLoc) {
                 pureFltPath.push(lastLoc);
             } else if (cleanCity(destination) && pureFltPath[0] !== cleanCity(destination)) {
                 pureFltPath.push(cleanCity(destination));
             }
          }

          for (let i = 0; i < pureFltPath.length - 1; i++) {
            legs.push({
               from: pureFltPath[i],
               to: pureFltPath[i+1],
               flightNo: fltStr,
               events: fltEvs
            });
          }
      }
}

console.log("LEGS:", legs);

for (const xl of excelLegs) {
    if (!legs.some(l => cleanCity(l.from) === cleanCity(xl.from) && cleanCity(l.to) === cleanCity(xl.to))) {
      legs.push({
        from: cleanCity(xl.from),
        to: cleanCity(xl.to),
        flightNo: xl.flight,
        events: []
      });
    }
}
console.log("AFTER EXCEL LEGS:", legs);

const starts = legs.filter(l => cleanCity(l.from) === cleanCity(origin));
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
for (const start of starts) traverse([start]);

const seenFirstLegs = new Set();
const filteredFlows = [];
flows.sort((a, b) => b.length - a.length);

for (const flow of flows) {
     const startLeg = flow[0];
     const repDateStr = startLeg.events && startLeg.events.length > 0 
           ? new Date(startLeg.events[0].date || 0).getDate() 
           : 'NODATE';
     const legKey = `${startLeg.to}-${startLeg.flightNo || 'NOFLIGHT'}-${repDateStr}`;
     if (!seenFirstLegs.has(legKey)) {
         seenFirstLegs.add(legKey);
         filteredFlows.push(flow);
     }
}

console.log("FLOWS:", filteredFlows.map(f => f.map(l => `${l.from}->${l.to}`).join(' , ')));

