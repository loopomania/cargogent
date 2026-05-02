import { getPool } from "./db.js";
import { ParsedTransportLine } from "./excelParser.js";

/**
 * Airline shipment identity for scheduling: `(tenant_id, mawb, hawb)`.
 * - `tenant_id` separates two organizations that may both track the same MAWB+HAWB pair.
 * - `domain_name` on `query_schedule` is only UI/metadata (which email domain ingested);
 *   it is not part of shipment identity — two domains under one tenant share one row per AWB pair.
 *
 * Uses MAWB digits only (no dashes). HAWB from Excel house ref only; MAWB-only when empty.
 * Excel file/shipment ids are logistics keys, not the airline HAWB+MAWB pair.
 */
function scheduleKeysFromExcelLine(line: ParsedTransportLine): { mawb: string; hawb: string } {
  const mawb = line.masterAwb.replace(/-/g, "");
  const house = `${line.houseRef ?? ""}`.trim();
  if (!house) {
    return { mawb, hawb: mawb };
  }
  const houseNorm = house.replace(/-/g, "");
  const hawb = houseNorm === mawb ? mawb : house;
  return { mawb, hawb };
}

/** True if this tenant already tracks `(mawb, hawb)` — scoped by tenant so other tenants may track the same pair. */
async function shipmentAlreadyTrackedForTenant(
  tenantId: string,
  mawb: string,
  hawb: string,
): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  const res = await p.query(
    `SELECT (
       EXISTS (
         SELECT 1 FROM leg_status_summary ls
         WHERE ls.tenant_id = $1::uuid AND ls.shipment_id = $2 AND ls.leg_sequence = 1
       )
       OR EXISTS (
         SELECT 1 FROM query_schedule qs
         WHERE qs.tenant_id = $1::uuid AND qs.mawb = $3 AND qs.hawb = $2
       )
     ) AS known`,
    [tenantId, hawb, mawb],
  );
  return res.rows[0]?.known === true;
}

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

    // 3. Pair HAWB/MAWB in lookup (same MAWB+HAWB identity as query_schedule + tenant)
    if (line.masterAwb && line.masterAwb.length > 5) {
      const { mawb: mawbKey, hawb: hawbKey } = scheduleKeysFromExcelLine(line);
      await p.query(
        `INSERT INTO hawb_mawb_lines (tenant_id, hawb, mawb)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, hawb, mawb) DO NOTHING`,
        [tenantId, hawbKey, mawbKey]
      );

      // 4. Schedule polling only for shipments new to this tenant — repeat Excel must not
      //    re-insert into query_schedule (e.g. after delivery removed the row).
      const domainName = senderEmail ? senderEmail.split('@')[1] : null;
      const known = await shipmentAlreadyTrackedForTenant(tenantId, mawbKey, hawbKey);
      if (!known) {
        await p.query(
          `INSERT INTO query_schedule (tenant_id, mawb, hawb, next_status_check_at, domain_name)
           VALUES ($1, $2, $3, NOW() + interval '10 minutes', $4)
           ON CONFLICT (tenant_id, mawb, hawb) DO UPDATE SET domain_name = EXCLUDED.domain_name`,
          [tenantId, mawbKey, hawbKey, domainName]
        );
      }
    }
  }

  return batchId;
}
