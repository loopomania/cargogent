import pg from 'pg';

const connectionString = "postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require";

const pool = new pg.Pool({ 
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    // Find latest batch
    const batchRes = await pool.query(`
      SELECT id, original_filename, excel_template 
      FROM excel_import_batches 
      ORDER BY id DESC 
      LIMIT 5
    `);
    
    console.log("Recent import batches:");
    console.table(batchRes.rows);

    for (const batch of batchRes.rows) {
        const lineRes = await pool.query(`SELECT COUNT(*) as c FROM excel_transport_lines WHERE batch_id = $1`, [batch.id]);
        console.log(`Batch ${batch.id} has ${lineRes.rows[0].c} lines.`);
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
main();
