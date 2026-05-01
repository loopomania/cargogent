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

const excelLegs = [
  { seq: 1, from: 'ILTLV', to: 'GRATH', etd: '2026-04-20T', eta: null },
  { seq: 2, from: 'GRATH', to: 'CAYUL', etd: null, eta: '2026-04-23T' }
];

const flow = [
  { from: 'TLV', to: 'ATH' },
  { from: 'ATH', to: 'YUL' }
];

for (let i = 0; i < flow.length; i++) {
  const leg = flow[i];
  const xlLeg = excelLegs.find(xl => cleanCity(xl.from) === leg.from && cleanCity(xl.to) === leg.to) || excelLegs[i];
  const xlEtd = xlLeg?.etd;
  const xlEta = xlLeg?.eta;
  
  console.log(`Leg ${leg.from}->${leg.to}: xlLeg=${xlLeg?.from}->${xlLeg?.to}, etd=${xlEtd}, eta=${xlEta}`);
}
