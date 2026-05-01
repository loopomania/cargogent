import fs from 'fs';

const data = fs.readFileSync('src/routes/track.ts', 'utf8');
const lines = data.split('\n');
const start = lines.findIndex(l => l.includes('error_count_consecutive'));
console.log(lines.slice(Math.max(0, start - 20), start + 20).join('\n'));
