import pg from 'pg';

const connectionString = "postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  try {
    const res = await pool.query(`DELETE FROM excel_transport_lines WHERE excel_template = 'dsv_air_import_l2077' RETURNING *`);
    console.log(`Deleted ${res.rowCount} rows from excel_transport_lines.`);

    const mawbs = res.rows.map(r => r.master_awb).filter(Boolean);
    if (mawbs.length > 0) {
        const delQs = await pool.query(`DELETE FROM query_schedule WHERE mawb = ANY($1::text[])`, [mawbs]);
        console.log(`Deleted ${delQs.rowCount} from query_schedule.`);
    }

    const delB = await pool.query(`DELETE FROM excel_import_batches WHERE sender_email = 'test@test.com'`);
    console.log(`Deleted ${delB.rowCount} test batches.`);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
main();
