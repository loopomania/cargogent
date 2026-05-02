import fs from 'fs';

const file = fs.readFileSync('frontend/src/components/MilestonePlan.tsx', 'utf-8');
const lines = file.split('\n');

const start = lines.findIndex(l => l.includes('const firstDepLoc = cleanCity(fltEvs.find(e => e.status_code === \'DEP\')?.location);'));
console.log(lines.slice(start - 5, start + 30).join('\n'));
