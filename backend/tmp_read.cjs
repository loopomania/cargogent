const XLSX = require('xlsx');
try {
  const workbook = XLSX.readFile('../awbs/IL1 Shipment Profile Report Monday, 30 March 2026 17_46_43.xlsx');
  const sheet_name_list = workbook.SheetNames;
  const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheet_name_list[0]], {header: 1});
  for (let i = 0; i < 20; i++) {
    console.log(`Row ${i}:`, data[i]);
  }
} catch (e) {
  console.error("Error:", e);
}
