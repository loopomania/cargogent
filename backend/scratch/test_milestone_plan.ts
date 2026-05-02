import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });

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

const safeTime = (e?: any | null) => {
  const d = e?.date || e?.estimated_date;
  return d ? new Date(d).getTime() || 0 : 0;
};

function buildLegs(allEvents: any[], origin: string, destination: string, excelLegs: any[] = []): any[] {
  // Robust flight-based path reconstruction (supports split shipments)
  const chronoEvs = [...allEvents].sort((a, b) => safeTime(a) - safeTime(b));
  
  // Find all distinct flights mentioned in DEP or ARR events
  const flightNumbers = Array.from(new Set(
    chronoEvs
      .filter(e => ['DEP', 'ARR', 'DLV'].includes(e.status_code || '') && e.flight)
      .map(e => e.flight!)
  ));

  const legs: any[] = [];

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

  legs.sort((a, b) => {
    const aEv = allEvents.find(e => (e.flight === a.flightNo || !a.flightNo) && (cleanCity(e.location) === a.from || cleanCity(e.location) === a.to));
    const bEv = allEvents.find(e => (e.flight === b.flightNo || !b.flightNo) && (cleanCity(e.location) === b.from || cleanCity(e.location) === b.to));
    return safeTime(aEv) - safeTime(bEv);
  });
  
  if (legs.length === 0) {
      legs.push({
         from: origin, to: destination, service: "FLIGHT",
         flightNo: null, atd: null, etd: null, ata: null, eta: null,
         pieces: null, weight: null, events: allEvents
      });
  }

  return legs;
}

function buildFlows(legs: any[], origin: string): any[][] {
  if (legs.length === 0) return [];
  
  const starts = legs.filter(l => cleanCity(l.from) === cleanCity(origin));
  if (starts.length === 0) {
    const allTos = new Set(legs.map(l => cleanCity(l.to)));
    const noPreds = legs.filter(l => !allTos.has(cleanCity(l.from)));
    starts.push(...(noPreds.length > 0 ? noPreds : [legs[0]]));
  }

  const flows: any[][] = [];

  function traverse(currentPath: any[]) {
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

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT mawb, hawb, json_agg(json_build_object(
        'status_code', status_code,
        'location', location,
        'date', occurred_at,
        'flight', payload->>'flight',
        'remarks', status_text,
        'source', source
    )) as events,
    (SELECT summary FROM leg_status_summary WHERE shipment_id = query_events.hawb OR shipment_id = query_events.mawb LIMIT 1) as summary
    FROM query_events
    WHERE mawb = '01692075911' OR mawb = '01692075664'
    GROUP BY mawb, hawb
  `);
  
  for (const row of res.rows) {
      let origin = cleanCity(row.summary?.origin) || "???";
      let destination = cleanCity(row.summary?.destination) || "???";
      const excelLegs = row.summary?.raw_meta?.excel_legs || [];
      const events = row.events;
      
      const legs = buildLegs(events, origin, destination, excelLegs);
      const flows = buildFlows(legs, origin);
      console.log(`MAWB: ${row.mawb} | HAWB: ${row.hawb}`);
      console.log(`Flows count: ${flows.length}`);
      flows.forEach((f, i) => console.log(` Flow ${i+1}: ${f.map((l:any) => `${l.from}->${l.to}`).join(', ')}`));
  }
  await client.end();
}
run().catch(console.error);
