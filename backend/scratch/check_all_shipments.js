import pg from 'pg';

const connectionString = "postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  try {
    const res = await pool.query(`SELECT COUNT(*) FROM excel_transport_lines WHERE excel_template = 'dsv_air_import_l2077'`);
    console.log(`There are ${res.rows[0].count} shipments with dsv_air_import_l2077 in the DB.`);
    
    // Also, count them by batch_id
    const res2 = await pool.query(`SELECT batch_id, count(*) FROM excel_transport_lines WHERE excel_template = 'dsv_air_import_l2077' GROUP BY batch_id`);
    console.log("By batch:");
    console.table(res2.rows);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
main();
