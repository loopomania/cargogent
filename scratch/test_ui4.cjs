// simulated node rendering logic
function renderNode(excelEtd, excelEta) {
  const hasExcelSlot = excelEtd !== undefined || excelEta !== undefined;
  if (!hasExcelSlot) return "No Excel data";
  const xlType = excelEtd !== undefined ? "EDT" : "ETA";
  const xlDate = excelEtd !== undefined ? excelEtd : excelEta;
  return `Excel ${xlType}: ${xlDate}`;
}

const excelLegs = [
  { from: 'ILTLV', to: 'VNHAN', etd: '2026-04-17T02:14:16', eta: '2026-04-20T09:58:00' }
];

const leg = { from: 'TLV', to: 'ATH' };

const xlLeg = excelLegs.find(xl => xl.from === leg.from && xl.to === leg.to) || excelLegs[0];
const xlEtd = xlLeg?.etd;
const xlEta = xlLeg?.eta;

console.log("Takeoff node:", renderNode(xlEtd, undefined));
console.log("Landing node:", renderNode(undefined, xlEta));
