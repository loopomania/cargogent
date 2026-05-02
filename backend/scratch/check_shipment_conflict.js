import pg from 'pg';

const connectionString = "postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require";

const pool = new pg.Pool({ 
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const ids = ['A/1857947']; // from the console output
    const res = await pool.query(`SELECT * FROM excel_transport_lines WHERE shipment_id = ANY($1::text[])`, [ids]);
    console.log(`Found ${res.rowCount} rows for A/1857947.`);
    if (res.rowCount > 0) {
        console.log(`First row batch_id: ${res.rows[0].batch_id}`);
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
main();
