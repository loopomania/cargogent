import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('../.env-prod'));
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const mawbs = ['02022254223', '02022254212', '02022254201', '01692211534', '01692075955', '01692075933'];
  
  for (const mawb of mawbs) {
    const eventsRes = await pool.query(
      "SELECT payload FROM query_events WHERE mawb = $1 AND source = 'airline' ORDER BY created_at DESC LIMIT 1",
      [mawb]
    );
    
    let lastStatus = 'Unknown';
    let lastMessage = 'Unknown';
    if (eventsRes.rows.length > 0) {
      const p = typeof eventsRes.rows[0].payload === 'string' ? JSON.parse(eventsRes.rows[0].payload) : eventsRes.rows[0].payload;
      lastStatus = p.status || p.status_code;
      lastMessage = p.message || p.remarks;
    }
    
    const qsRes = await pool.query("SELECT hawb FROM query_schedule WHERE mawb = $1 LIMIT 1", [mawb]);
    const hawb = qsRes.rows[0]?.hawb;
    
    let pieces = 'Unknown';
    let dates = {};
    let legsCount = 0;
    
    if (hawb) {
       const lsRes = await pool.query(
          "SELECT summary FROM leg_status_summary WHERE shipment_id = $1 LIMIT 1",
          [hawb]
       );
       if (lsRes.rows.length > 0) {
          const sum = lsRes.rows[0].summary;
          pieces = sum.raw_meta?.pieces;
          dates = { etd: sum.etd, atd: sum.atd, eta: sum.eta, ata: sum.ata };
          legsCount = sum.raw_meta?.excel_legs?.length || 0;
       }
    }
    
    console.log(`MAWB: ${mawb}`);
    console.log(`  Last Status: ${lastStatus} | Message: ${lastMessage}`);
    console.log(`  Pieces: ${pieces}`);
    console.log(`  Dates: ${JSON.stringify(dates)}`);
    console.log("-----------------------");
  }

  await pool.end();
}
run();
