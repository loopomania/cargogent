function cleanCity(loc) {
  if (!loc || loc === "???") return null;
  let clean = loc.replace(/\s*\([^)]*\)/g, "").trim().toUpperCase();
  if (clean.length === 5 && !clean.includes(" ")) {
    clean = clean.substring(2);
  }
  return clean;
}
function safeTime(e) {
  return e && e.date ? new Date(e.date).getTime() : 0;
}

const allEvents = [
  { status_code: 'RCS', location: 'TLV (MAMAN)', date: '2026-04-17 02:14:16' },
  { status_code: 'RCS', location: 'Athens (ATH)', date: 'Apr 20, 2026 09:58' },
  { status_code: 'ARR', location: 'Athens (ATH)', flight: 'LY843', date: 'Apr 20, 2026 09:58' },
  { status_code: 'ARR', location: 'Athens (ATH)', flight: 'LY845', date: 'Apr 22, 2026 13:20' }
];

const origin = "TLV";
const destination = "ATH";

const chronoEvs = [...allEvents].sort((a, b) => safeTime(a) - safeTime(b));

const flightNumbers = Array.from(new Set(
  chronoEvs
    .filter(e => ['DEP', 'ARR', 'DLV'].includes(e.status_code || '') && e.flight)
    .map(e => e.flight)
));

const legs = [];

if (flightNumbers.length > 0) {
  for (const flt of flightNumbers) {
    const fltEvs = chronoEvs.filter(e => e.flight === flt);
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
    
    if (pureFltPath.length === 1 && cleanCity(destination)) {
       if (pureFltPath[0] !== cleanCity(destination)) {
           pureFltPath.push(cleanCity(destination));
       }
    }

    for (let i = 0; i < pureFltPath.length - 1; i++) {
      const pFrom = pureFltPath[i];
      const pTo = pureFltPath[i+1];
      legs.push({
         from: pFrom, to: pTo, flightNo: flt
      });
    }
  }
}

console.log(legs);
