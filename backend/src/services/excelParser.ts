import * as xlsx from "xlsx";

/**
 * Normalizes Excel dates from serial format or strings into ISO strings.
 */
function parseExcelDate(dateVal: any): string | null {
  if (!dateVal) return null;
  if (typeof dateVal === 'number') {
    // Excel date epoch math
    const d = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
    return d.toISOString();
  }
  // Fallback for strings
  const d = new Date(dateVal);
  if (!isNaN(d.getTime())) return d.toISOString();
  return null;
}

/**
 * Core interface for the normalized Excel data
 */
export interface ParsedTransportLine {
  excelTemplate: "dsv_air_import_l2077" | "il1_shipment_profile";
  shipmentId: string;
  jobNumber?: string;
  legSequence: number;
  masterAwb: string;
  houseRef: string;
  origin?: string;
  destination?: string;
  firstLegEtd?: string | null;
  firstLegAtd?: string | null;
  israelLandingEta?: string | null;
  israelLandingAta?: string | null;
  legLoadPort?: string | null;
  legDischargePort?: string | null;
  legEtd?: string | null;
  legEta?: string | null;
  legAtd?: string | null;
  legAta?: string | null;
  rawExcelRow: Record<string, any>;
  valuesOriginal: Record<string, any>;
}

export function parseExcelBuffer(buffer: Buffer): ParsedTransportLine[] {
  const wb = xlsx.read(buffer, { type: "buffer", cellDates: true, cellNF: false, cellText: false });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  
  // Read all as arrays to manually identify the header row
  const rawRows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (rawRows.length === 0) return [];

  let headerIndex = -1;
  let templateType: "dsv_air_import_l2077" | "il1_shipment_profile" | null = null;
  
  for (let i = 0; i < Math.min(rawRows.length, 20); i++) {
    const rowStr = rawRows[i].join(" ").toLowerCase();
    if (rowStr.includes("file number") || rowStr.includes("l2077")) {
      headerIndex = i;
      templateType = "dsv_air_import_l2077";
      break;
    } else if (rowStr.includes("shipment id") && rowStr.includes("leg load port")) {
      headerIndex = i;
      templateType = "il1_shipment_profile";
      break;
    }
  }

  if (headerIndex === -1 || !templateType) {
    throw new Error("Could not detect Excel template. Missing required headers.");
  }

  const headers = rawRows[headerIndex].map(h => String(h || "").trim());
  const dataRows: Record<string, any>[] = [];

  for (let i = headerIndex + 1; i < rawRows.length; i++) {
    const rowArr = rawRows[i];
    if (!rowArr || rowArr.length === 0) continue;
    
    // Check if empty row
    if (rowArr.every(cell => !cell || String(cell).trim() === "")) continue;

    const rowObj: Record<string, any> = {};
    for (let col = 0; col < headers.length; col++) {
      if (headers[col]) {
        rowObj[headers[col]] = rowArr[col] !== undefined ? rowArr[col] : "";
      }
    }
    dataRows.push(rowObj);
  }

  if (templateType === "il1_shipment_profile") {
    return parseIL1(dataRows);
  } else {
    return parseL2077(dataRows);
  }
}

function parseIL1(rows: Record<string, any>[]): ParsedTransportLine[] {
  const results: ParsedTransportLine[] = [];
  const legCounters: Record<string, number> = {};

  for (const row of rows) {
    const shipmentId = String(row["Shipment ID"] || "").trim();
    if (!shipmentId) continue;

    if (!legCounters[shipmentId]) {
      legCounters[shipmentId] = 0;
    }
    legCounters[shipmentId] += 1;
    const seq = legCounters[shipmentId];

    const masterAwb = String(row["Master AWB"] || row["Master"] || "").trim();
    const houseRef = String(row["House AWB"] || row["House Ref"] || "").trim();

    // Isolate specific versioned fields specified in PRD
    const versioned = {
      Weight: row["Weight"],
      UQ: row["Volume UQ"],
      Outer: row["Outer"],
      "Origin ETD": row["Origin ETD"],
      "Dest ETA": row["Dest ETA"],
      "Leg Load Port": row["Leg Load Port"],
      "Leg Discharge Port": row["Leg Discharge Port"],
      "Leg ATD": row["Leg ATD"],
      "Leg ATA": row["Leg ATA"]
    };

    results.push({
      excelTemplate: "il1_shipment_profile",
      shipmentId,
      legSequence: seq,
      masterAwb,
      houseRef,
      firstLegEtd: parseExcelDate(row["Origin ETD"]),
      israelLandingEta: parseExcelDate(row["Dest ETA"]),
      legLoadPort: row["Leg Load Port"],
      legDischargePort: row["Leg Discharge Port"],
      legEtd: parseExcelDate(row["Leg ETD"]),
      legEta: parseExcelDate(row["Leg ETA"]),
      legAtd: parseExcelDate(row["Leg ATD"]),
      legAta: parseExcelDate(row["Leg ATA"]),
      rawExcelRow: row,
      valuesOriginal: versioned
    });
  }
  return results;
}

function parseL2077(rows: Record<string, any>[]): ParsedTransportLine[] {
  const results: ParsedTransportLine[] = [];

  for (const row of rows) {
    const fileNumber = String(row["File Number"] || "").trim();
    if (!fileNumber) continue;

    let masterAwb = String(row["Master AWB"] || row["Master BL"] || "").trim();
    const houseRef = String(row["House AWB"] || row["Full HAWB"] || "").trim();
    const carrierId = String(row["Carrier ID"] || "").trim();

    // If master is just the 8-digit serial and we have a 3-digit carrier ID, combine them
    if (masterAwb.length === 8 && /^\d{8}$/.test(masterAwb) && /^\d{3}$/.test(carrierId)) {
      masterAwb = `${carrierId}-${masterAwb}`;
    } else if (masterAwb.length === 11 && /^\d{11}$/.test(masterAwb)) {
      masterAwb = `${masterAwb.substring(0, 3)}-${masterAwb.substring(3)}`;
    }

    // Isolate specific versioned fields specified in PRD
    const versioned = {
      "Ch. Wght": row["Ch. Wght"],
      "PCS": row["PCS"],
      "ETD": row["ETD"],
      "ATD": row["ATD"],
      "ETA": row["ETA"],
      "ATA": row["ATA"],
      "Carrier ID": row["Carrier ID"],
      "Carrier Name": row["Carrier Name"],
      "Load Port/Gateway ID": row["Load Port/Gateway ID"],
      "Customs File No": row["Customs File No"],
      "Importer Name": row["Importer Name"],
      "Exporter Name": row["Exporter Name"]
    };

    results.push({
      excelTemplate: "dsv_air_import_l2077",
      shipmentId: fileNumber,
      jobNumber: String(row["Job Number"] || "").trim(),
      legSequence: 1, // Start at 1 natively for imports
      masterAwb,
      houseRef,
      origin: String(row["Load Port/Gateway ID"] || "").trim(),
      destination: "TLV", // Implied for import documents to Israel
      firstLegEtd: parseExcelDate(row["ETD"]),
      firstLegAtd: parseExcelDate(row["ATD"]),
      israelLandingEta: parseExcelDate(row["ETA"]),
      israelLandingAta: parseExcelDate(row["ATA"]),
      rawExcelRow: row,
      valuesOriginal: versioned
    });
  }
  return results;
}
