import { parseExcelBuffer } from '../src/services/excelParser.ts';
import fs from 'fs';
import pg from 'pg';

const connectionString = "postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function testIngest() {
  try {
    const buffer = fs.readFileSync('/Users/alonmarom/dev/cargogent/awbs/import.test.xlsx');
    const lines = parseExcelBuffer(buffer);
    
    const res = await pool.query('SELECT id FROM tenants LIMIT 1');
    const tenantId = res.rows[0].id;
    
    // 1. Create audit batch
    const batchRes = await pool.query(
        `INSERT INTO excel_import_batches 
        (tenant_id, original_filename, excel_template, parser_version, sender_email) 
        VALUES ($1, $2, $3, 1, $4) 
        RETURNING id`,
        [tenantId, "import.test.xlsx", lines[0].excelTemplate, "test@test.com"]
    );
    const batchId = batchRes.rows[0].id;
    console.log(`Created batch ${batchId}`);

    for (const line of lines) {
        try {
            await pool.query(
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
            console.log(`Inserted line ${line.shipmentId}`);
        } catch (e) {
            console.error(`ERROR INSERTING LINE ${line.shipmentId}:`, e);
            throw e;
        }
    }
  } catch (e) {
    console.error("INGEST ERROR:", e);
  } finally {
    process.exit(0);
  }
}
testIngest();
