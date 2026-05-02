import fs from 'fs';

const file = fs.readFileSync('frontend/src/components/MilestonePlan.tsx', 'utf-8');
const lines = file.split('\n');

const start = lines.findIndex(l => l.includes('function buildFlows'));
console.log(lines.slice(start, start + 50).join('\n'));
