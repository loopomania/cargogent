import pg from 'pg';

const connectionString = "postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  try {
    const lsRes = await pool.query(`
      SELECT shipment_id, last_event_at, aggregated_status
      FROM leg_status_summary
      WHERE shipment_id LIKE '%19736625%' OR shipment_id = 'OTA00114638'
    `);
    console.log("leg_status_summary:");
    console.table(lsRes.rows);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
main();
