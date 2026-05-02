import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const tenantId = '8998b6c6-85b4-4be5-af58-49c6bdc28890';
  const mawb = '01692075841';
  const hawb = 'ISR10056087';

  const ls = await pool.query(`SELECT summary FROM leg_status_summary WHERE shipment_id = $1`, [hawb]);
  const data = {
     origin: 'TLV',
     destination: 'ORD',
     raw_meta: typeof ls.rows[0].summary.raw_meta === 'string' ? JSON.parse(ls.rows[0].summary.raw_meta) : ls.rows[0].summary.raw_meta,
     status: 'Delivered'
  };

  const evQ = await pool.query(`SELECT * FROM query_events WHERE mawb = $1 AND hawb = $2`, [mawb, hawb]);
  const events = evQ.rows.map(r => typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload);
  
  const sorted = [...events].sort(
    (a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
  );
  const latestEvent = sorted[sorted.length - 1];
  let derivedStatus = latestEvent?.status ?? latestEvent?.status_code ?? data.status ?? "No Status";

  const dlvEvents = events.filter((e) => e.status_code === "DLV");
  let isFullyDelivered = false;

  if (dlvEvents.length > 0) {
    const extractPcs = (val) => {
      if (!val) return 0;
      const s = String(val).replace(/[^0-9]/g, "");
      return s ? parseInt(s, 10) : 0;
    };

    let expectedTotal = extractPcs(data.raw_meta?.pieces);
    const maxEventPieces = Math.max(0, ...events.map((e) => extractPcs(e.pieces)));
    if (maxEventPieces > expectedTotal) expectedTotal = maxEventPieces;

    let airlineDeliveredTotal = 0;
    let groundDeliveredTotal = 0;
    let airlineDlvCount = 0;
    let groundDlvCount = 0;
    for (const e of dlvEvents) {
      const pcs = extractPcs(e.actual_pieces || e.pieces);
      if (e.source === "maman" || e.source === "swissport" || e.source === "ground") {
        groundDeliveredTotal += pcs;
        groundDlvCount++;
      } else {
        airlineDeliveredTotal += pcs;
        airlineDlvCount++;
      }
    }

    const isExport = data.origin === "TLV" || data.origin === "TEL AVIV";

    if (isExport) {
      if ((expectedTotal > 0 && airlineDeliveredTotal >= expectedTotal) || (expectedTotal === 0 && airlineDlvCount > 0)) {
        isFullyDelivered = true;
        derivedStatus = "Delivered";
      } else {
        derivedStatus = "Partial Delivery";
      }
    }
    
    console.log({
       latestEventStatus: latestEvent?.status,
       expectedTotal,
       airlineDeliveredTotal,
       airlineDlvCount,
       isExport,
       isFullyDelivered,
       derivedStatus
    });
  } else {
    console.log("No DLV events!");
  }
  pool.end();
}
main().catch(console.error);
