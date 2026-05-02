import { getPool } from "./db.js";
import { ParsedTransportLine } from "./excelParser.js";

export async function processIngestedExcel(
  tenantId: string,
  originalFilename: string,
  lines: ParsedTransportLine[],
  senderEmail?: string
): Promise<string> {
  const p = getPool();
  if (!p) throw new Error("DB not connected");

  if (lines.length === 0) {
    throw new Error("No valid transport lines found in Excel file.");
  }

  // 1. Create audit batch
  const batchRes = await p.query(
    `INSERT INTO excel_import_batches 
      (tenant_id, original_filename, excel_template, parser_version, sender_email) 
     VALUES ($1, $2, $3, 1, $4) 
     RETURNING id`,
    [tenantId, originalFilename, lines[0].excelTemplate, senderEmail || null]
  );
  const batchId = batchRes.rows[0].id;

  // 2. Insert lines, handling UPSERTs for original versions natively
  for (const line of lines) {
    await p.query(
      `INSERT INTO excel_transport_lines 
        (
          tenant_id, batch_id, first_batch_id, excel_template, shipment_id, 
          job_number, leg_sequence, source, master_awb, house_ref,
          first_leg_etd, first_leg_atd, israel_landing_eta, israel_landing_ata,
          leg_load_port, leg_discharge_port, leg_etd, leg_eta, leg_atd, leg_ata,
          raw_excel_row, values_original, values_latest
        ) 
       VALUES 
        ($1, $2, $2, $3, $4, $5, $6, 'excel', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $20)
       ON CONFLICT (tenant_id, shipment_id, leg_sequence) 
       DO NOTHING
      `,
      [
        tenantId, batchId, line.excelTemplate, line.shipmentId,
        line.jobNumber || null, line.legSequence, line.masterAwb, line.houseRef,
        line.firstLegEtd, line.firstLegAtd, line.israelLandingEta, line.israelLandingAta,
        line.legLoadPort, line.legDischargePort, line.legEtd, line.legEta, line.legAtd, line.legAta,
        line.rawExcelRow, line.valuesOriginal
      ]
    );

    // 3. Pair HAWB/MAWB in lookup
    if (line.masterAwb && line.masterAwb.length > 5) {
      await p.query(
        `INSERT INTO hawb_mawb_lines (tenant_id, hawb, mawb)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, hawb, mawb) DO NOTHING`,
        [tenantId, line.houseRef || line.shipmentId, line.masterAwb]
      );

      // 4. Upsert into Query Schedule natively for active tracking
      const domainName = senderEmail ? senderEmail.split('@')[1] : null;
      await p.query(
        `INSERT INTO query_schedule (tenant_id, mawb, hawb, next_status_check_at, domain_name)
         VALUES ($1, $2, $3, NOW() + interval '10 minutes', $4)
         ON CONFLICT (tenant_id, mawb, hawb) DO UPDATE SET domain_name = EXCLUDED.domain_name`,
        [tenantId, line.masterAwb, line.houseRef || line.shipmentId, domainName]
      );
    }
  }

  return batchId;
}
