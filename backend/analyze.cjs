const XLSX = require('xlsx');
const fs = require('fs');

function analyzeFile(filePath) {
  let report = "# Analysis Report: IL1 Shipment Profile Report (with Legs considered)\n\n";
  try {
    const workbook = XLSX.readFile(filePath);
    const sheet_name_list = workbook.SheetNames;
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheet_name_list[0]], {header: 1});

    // Row 13 has headers, data starts at row 14
    const dataRows = data.slice(14);
    
    // MAWB is at index 7, HAWB is at index 8
    // Leg Load Port is at index 24, Leg Discharge Port is at index 25
    const pairs = {}; // key: mawb|hawb -> value: {shipmentIds: Set, legs: Set, rows: Array, dupLegsStats: {}, multipleShipmentIds: false}
    const missingData = [];
    const invalidAWBs = [];
    const duplicatePairs = {};
    
    let processedRows = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      // Skip empty rows
      if (!row || row.length === 0) continue;
      
      const shipmentId = row[2];
      if (!shipmentId) continue; // Not a shipment data row
      
      processedRows++;
      
      let mawb = row[7] ? String(row[7]).trim() : "";
      let hawb = row[8] ? String(row[8]).trim() : "";
      let legLoad = row[24] ? String(row[24]).trim() : "UNKNOWN_LOAD";
      let legDischarge = row[25] ? String(row[25]).trim() : "UNKNOWN_DISCHARGE";
      
      const actualRowNumber = i + 15; // Excel is 1-indexed, starting from row index 14 -> 15

      // Missing data
      if (!mawb || !hawb) {
        missingData.push({row: actualRowNumber, shipmentId, mawb, hawb});
      }

      // Invalid AWBs
      if (mawb) {
        const cleanedMawb = mawb.replace(/[^0-9]/g, '');
        if (cleanedMawb.length !== 11) {
          invalidAWBs.push({row: actualRowNumber, shipmentId, mawb, reason: "Length is not 11 digits"});
        }
      }

      // Check duplicates considering legs
      const pairKey = `${mawb.toLowerCase()}|${hawb.toLowerCase()}`;
      const legKey = `${legLoad}->${legDischarge}`;
      
      if (!pairs[pairKey]) {
         pairs[pairKey] = {
           mawb, 
           hawb, 
           shipmentIds: new Set([shipmentId]),
           legsSeen: new Set([legKey]),
           dupRowsByLeg: {},
           isDuplicate: false, // Will flag if duplicate legs or multiple shipment IDs
           allRows: [actualRowNumber]
         };
         // To track rows per exact leg
         pairs[pairKey].dupRowsByLeg[legKey] = [actualRowNumber];
      } else {
         const p = pairs[pairKey];
         p.shipmentIds.add(shipmentId);
         p.allRows.push(actualRowNumber);
         
         if (p.dupRowsByLeg[legKey]) {
            p.dupRowsByLeg[legKey].push(actualRowNumber);
            p.isDuplicate = true; // Same MAWB+HAWB and SAME leg = duplicate!
         } else {
            p.dupRowsByLeg[legKey] = [actualRowNumber];
            p.legsSeen.add(legKey);
         }
         
         if (p.shipmentIds.size > 1) {
            p.isDuplicate = true; // Multiple distinct shipment IDs for same MAWB+HAWB = conflict
         }
      }
    }

    // Filter true duplicates
    for (const key in pairs) {
       if (pairs[key].isDuplicate) {
          duplicatePairs[key] = pairs[key];
       }
    }

    report += `## Summary\n`;
    report += `- Total rows processed: ${processedRows}\n`;
    report += `- Duplicate MAWB+HAWB conflicts (same leg or different shipments): ${Object.keys(duplicatePairs).length}\n`;
    report += `- Rows with missing MAWB or HAWB data: ${missingData.length}\n`;
    report += `- Rows with invalid MAWB formats: ${invalidAWBs.length}\n\n`;

    report += `## 1. Duplicate MAWB + HAWB Pairs (Legs Accounted For)\n`;
    if (Object.keys(duplicatePairs).length === 0) {
      report += "No true duplicate pairs found when considering legs.\n\n";
    } else {
      for (const key in duplicatePairs) {
        const item = duplicatePairs[key];
        let dupReasons = [];
        
        // Reason 1: Same leg appears multiple times
        let sameLegDups = [];
        for (const leg of Object.keys(item.dupRowsByLeg)) {
           if (item.dupRowsByLeg[leg].length > 1) {
              sameLegDups.push(`${leg} (Rows: ${item.dupRowsByLeg[leg].join(", ")})`);
           }
        }
        if (sameLegDups.length > 0) {
           dupReasons.push(`Duplicate legs: ${sameLegDups.join(" | ")}`);
        }
        
        // Reason 2: Multiple shipment IDs
        if (item.shipmentIds.size > 1) {
           dupReasons.push(`Multiple Shipment IDs: ${Array.from(item.shipmentIds).join(", ")}`);
        }
        
        report += `- **MAWB**: \`${item.mawb}\`, **HAWB**: \`${item.hawb}\` - ${dupReasons.join(" AND ")}\n`;
      }
      report += "\n";
    }

    report += `## 2. Missing MAWB or HAWB Data\n`;
    if (missingData.length === 0) {
      report += "No missing data for AWBs found.\n\n";
    } else {
      missingData.forEach(item => {
        report += `- Excel Row ${item.row} (Shipment: ${item.shipmentId}) - **MAWB**: \`${item.mawb || "MISSING"}\`, **HAWB**: \`${item.hawb || "MISSING"}\`\n`;
      });
      report += "\n";
    }

    report += `## 3. Invalid MAWB Formats (Not 11 digits)\n`;
    if (invalidAWBs.length === 0) {
      report += "No invalid MAWBs found.\n\n";
    } else {
      invalidAWBs.forEach(item => {
        report += `- Excel Row ${item.row} (Shipment: ${item.shipmentId}) - **MAWB**: \`${item.mawb}\` (${item.reason})\n`;
      });
      report += "\n";
    }
    
    // Save report to file
    fs.writeFileSync('../awbs/Analysis_Report_30_March_With_Legs.md', report);
    console.log(`Analysis completed. ${Object.keys(duplicatePairs).length} true duplicates found.`);
    console.log("Report written to ../awbs/Analysis_Report_30_March_With_Legs.md");

  } catch (e) {
    console.error("Error running analysis:", e);
  }
}

analyzeFile('../awbs/IL1 Shipment Profile Report Monday, 30 March 2026 17_46_43.xlsx');
