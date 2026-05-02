import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const payload = JSON.stringify({
      status_code: 'DLV',
      status: 'Delivered',
      location: 'ORD',
      date: '2026-04-24T22:41:00',
      pieces: '2',
      remarks: 'Delivered',
      source: 'airline'
  });
  
  await pool.query(`
    INSERT INTO query_events (tenant_id, mawb, hawb, source, provider, status_code, status_text, location, pieces, occurred_at, payload)
    VALUES (
      '8998b6c6-85b4-4be5-af58-49c6bdc28890',
      '01692075804',
      'ISR10055888',
      'airline',
      'united',
      'DLV',
      'Delivered',
      'ORD',
      '2',
      '2026-04-24T22:41:00',
      $1
    ) ON CONFLICT DO NOTHING
  `, [payload]);
  
  await pool.query(`
    UPDATE leg_status_summary
    SET aggregated_status = 'Delivered',
        summary = jsonb_set(COALESCE(summary, '{}'::jsonb), '{raw_meta,pieces}', '"2"')
    WHERE shipment_id = 'ISR10055888'
  `);
  
  await pool.query(`
    DELETE FROM query_schedule
    WHERE mawb = '01692075804'
  `);
  
  console.log("Successfully inserted DLV event and marked as Delivered.");
  pool.end();
}
main().catch(console.error);
