import pg from 'pg';

const connectionString = "postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  try {
    const etl = await pool.query(`
      SELECT *
      FROM excel_transport_lines
      WHERE master_awb LIKE '%19736625%'
    `);
    console.log("excel_transport_lines:");
    console.log(etl.rows);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
main();
