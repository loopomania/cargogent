import { parseExcelBuffer } from '../src/services/excelParser.ts';
import fs from 'fs';

try {
  const buffer = fs.readFileSync('/Users/alonmarom/dev/cargogent/awbs/import.test.xlsx');
  const lines = parseExcelBuffer(buffer);
  console.log(`Parsed ${lines.length} lines.`);
  if (lines.length > 0) {
      console.log(lines[0]);
  }
} catch (e) {
  console.error(e);
}
