import pg from 'pg';

const connectionString = "postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  try {
    const batchRes = await pool.query(`
      SELECT id, original_filename, excel_template, ingested_at
      FROM excel_import_batches 
      ORDER BY ingested_at DESC 
      LIMIT 3
    `);
    
    console.log(batchRes.rows);
    
    if (batchRes.rows.length > 0) {
        const batchId = batchRes.rows[0].id;
        const lineRes = await pool.query(`SELECT COUNT(*) as c FROM excel_transport_lines WHERE batch_id = $1`, [batchId]);
        console.log(`Latest batch ${batchId} has ${lineRes.rows[0].c} lines.`);
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
main();
