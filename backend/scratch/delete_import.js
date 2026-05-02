import pg from 'pg';

const connectionString = "postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require";

const pool = new pg.Pool({ 
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    // Check columns
    const cols = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'excel_import_batches'
    `);
    console.log("Columns:", cols.rows.map(r => r.column_name).join(', '));
    
    // Fallback: order by id DESC
    const batchRes = await pool.query(`
      SELECT id, original_filename, excel_template
      FROM excel_import_batches 
      WHERE excel_template = 'dsv_air_import_l2077'
      ORDER BY id DESC 
      LIMIT 5
    `);
    
    console.log("Recent import batches:");
    console.table(batchRes.rows);

    if (batchRes.rows.length === 0) {
      console.log("No import batches found.");
      process.exit(1);
    }

    let targetBatchId = null;
    for (const batch of batchRes.rows) {
        const lineRes = await pool.query(`SELECT COUNT(*) as c FROM excel_transport_lines WHERE batch_id = $1`, [batch.id]);
        if (parseInt(lineRes.rows[0].c) === 21) {
            targetBatchId = batch.id;
            break;
        }
    }

    if (!targetBatchId) {
        targetBatchId = batchRes.rows[0].id;
        const lineRes = await pool.query(`SELECT COUNT(*) as c FROM excel_transport_lines WHERE batch_id = $1`, [targetBatchId]);
        console.log(`Using latest batch: ${targetBatchId} which has ${lineRes.rows[0].c} shipments.`);
    } else {
        console.log(`Found batch with exactly 21 shipments: ${targetBatchId}`);
    }

    const res = await pool.query(`DELETE FROM excel_transport_lines WHERE batch_id = $1 RETURNING *`, [targetBatchId]);
    console.log(`Deleted ${res.rowCount} rows from excel_transport_lines.`);

    await pool.query(`DELETE FROM excel_import_batches WHERE id = $1`, [targetBatchId]);
    console.log(`Deleted batch ${targetBatchId}.`);

    const mawbs = res.rows.map(r => r.master_awb).filter(Boolean);
    if (mawbs.length > 0) {
        const delQs = await pool.query(`DELETE FROM query_schedule WHERE mawb = ANY($1::text[])`, [mawbs]);
        console.log(`Deleted ${delQs.rowCount} from query_schedule.`);
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
main();
