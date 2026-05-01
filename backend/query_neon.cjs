const { Client } = require('pg');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('../.env-prod'));

const client = new Client({
  connectionString: envConfig.DATABASE_URL
});

async function run() {
  await client.connect();
  
  // Find a shipment with excel_legs
  const summaryRes = await client.query("SELECT shipment_id, summary FROM leg_status_summary WHERE summary->'raw_meta'->'excel_legs' IS NOT NULL LIMIT 1");
  if (summaryRes.rows.length > 0) {
    console.log("Found excel legs on", summaryRes.rows[0].shipment_id);
    console.log(JSON.stringify(summaryRes.rows[0].summary.raw_meta.excel_legs, null, 2));
  } else {
    console.log("No shipments with excel_legs found!");
  }
  
  await client.end();
}
run();
