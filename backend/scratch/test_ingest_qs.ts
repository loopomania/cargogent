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
    const senderEmail = "test@test.com";

    for (const line of lines) {
        if (line.masterAwb && line.masterAwb.length > 5) {
            console.log(`Inserting HAWB/MAWB for ${line.masterAwb}`);
            await pool.query(
                `INSERT INTO hawb_mawb_lines (tenant_id, hawb, mawb)
                VALUES ($1, $2, $3)
                ON CONFLICT (tenant_id, hawb, mawb) DO NOTHING`,
                [tenantId, line.houseRef || line.shipmentId, line.masterAwb]
            );

            console.log(`Inserting Query Schedule for ${line.masterAwb}`);
            const domainName = senderEmail ? senderEmail.split('@')[1] : null;
            await pool.query(
                `INSERT INTO query_schedule (tenant_id, mawb, hawb, next_status_check_at, domain_name)
                VALUES ($1, $2, $3, NOW() + interval '10 minutes', $4)
                ON CONFLICT (tenant_id, mawb, hawb) DO UPDATE SET domain_name = EXCLUDED.domain_name`,
                [tenantId, line.masterAwb, line.houseRef || line.shipmentId, domainName]
            );
        }
    }
    console.log("SUCCESS!");
  } catch (e) {
    console.error("INGEST ERROR:", e);
  } finally {
    process.exit(0);
  }
}
testIngest();
