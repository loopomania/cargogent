import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export function normalizeEventDate(rawStr) {
  const raw = (rawStr || "").trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d{3}Z)?)?/);
  if (isoMatch && raw.includes('Z')) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString();
  } else if (isoMatch) {
    const [, y, m, d, hh = "00", mi = "00", ss = "00"] = isoMatch;
    const parsed = new Date(`${y}-${m}-${d}T${hh}:${mi}:${ss}`);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const ddmmyy = raw.match(/^(\d{2})\/(\d{2})\/(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (ddmmyy) {
    const [, dd, mm, yy, hh = "00", mi = "00"] = ddmmyy;
    const parsed = new Date(`20${yy}-${mm}-${dd}T${hh}:${mi}:00`);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const ddmon = raw.match(/^(\d{1,2})\s+([A-Z]{3})(?:\s+(\d{2}:\d{2}))?/i);
  if (ddmon) {
    const months = {
      JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
      JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
    };
    const m = months[ddmon[2].toUpperCase()] ?? "01";
    const time = ddmon[3] ?? "00:00";
    const year = new Date().getFullYear();
    const parsed = new Date(`${year}-${m}-${ddmon[1].padStart(2, "0")}T${time}:00`);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) return parsed.toISOString();

  return raw;
}

async function main() {
  const groups = await pool.query(`SELECT DISTINCT tenant_id, mawb, hawb FROM query_events`);
  console.log(`Found ${groups.rows.length} unique shipments with events to migrate.`);

  let totalEventsCleaned = 0;
  let totalEventsDeleted = 0;

  for (const g of groups.rows) {
    const events = await pool.query(
      `SELECT * FROM query_events WHERE tenant_id = $1 AND mawb = $2 AND hawb = $3`,
      [g.tenant_id, g.mawb, g.hawb]
    );

    const parsedEvents = events.rows.map(r => {
      let p;
      try { p = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload; } catch (e) { p = r; }
      if (!p) p = {};
      
      // Merge db columns into payload just in case missing
      if (!p.source) p.source = r.source;
      if (!p.provider) p.provider = r.provider;
      if (!p.status_code) p.status_code = r.status_code;
      if (!p.status) p.status = r.status_text;
      if (!p.location) p.location = r.location;
      if (!p.date && r.occurred_at) p.date = r.occurred_at.toISOString();
      
      return p;
    });

    const unique = new Map();
    for (const ev of parsedEvents) {
       ev.date = normalizeEventDate(ev.date) || ev.date;
       if (ev.departure_date) ev.departure_date = normalizeEventDate(ev.departure_date) || ev.departure_date;
       if (ev.arrival_date) ev.arrival_date = normalizeEventDate(ev.arrival_date) || ev.arrival_date;

       const key = `${ev.status_code || "UNKN"}|${(ev.location || "").trim().toUpperCase()}|${ev.date || ""}`;
       if (!unique.has(key)) unique.set(key, ev);
    }

    const finalEvents = Array.from(unique.values()).sort((a,b) => new Date(a.date||0).getTime() - new Date(b.date||0).getTime());

    totalEventsDeleted += (parsedEvents.length - finalEvents.length);
    totalEventsCleaned += finalEvents.length;

    try {
        await pool.query('BEGIN');
        await pool.query('DELETE FROM query_events WHERE tenant_id = $1 AND mawb = $2 AND hawb = $3', [g.tenant_id, g.mawb, g.hawb]);

        for (const ev of finalEvents) {
            let occ = null;
            if (ev.date) {
                const d = new Date(ev.date);
                if (!isNaN(d.getTime())) occ = d.toISOString();
            }
            await pool.query(
                `INSERT INTO query_events (tenant_id, mawb, hawb, provider, source, occurred_at, status_code, status_text, location, weight, pieces, payload) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                [
                    g.tenant_id, g.mawb, g.hawb, 
                    ev.provider || "unknown", 
                    ev.source || "airline", 
                    occ, 
                    ev.status_code || null, 
                    ev.status || null, 
                    ev.location || null, 
                    ev.weight || null, 
                    ev.pieces || null, 
                    JSON.stringify(ev)
                ]
            );
        }

        // Update leg_status_summary
        const ataEvent = finalEvents.find(e => ["ARR", "RCF", "DLV"].includes(e.status_code))?.date || null;
        const etdEvent = finalEvents.find(e => e.status_code === "DEP")?.date || null;

        await pool.query(`
            UPDATE leg_status_summary
            SET summary = jsonb_set(
                           jsonb_set(
                            jsonb_set(summary, '{events_count}', $1::jsonb),
                           '{ata}', $2::jsonb),
                          '{etd}', $3::jsonb)
            WHERE tenant_id = $4 AND shipment_id = COALESCE($5, $6) AND leg_sequence = 1
        `, [finalEvents.length, JSON.stringify(ataEvent), JSON.stringify(etdEvent), g.tenant_id, g.hawb, g.mawb]);

        await pool.query('COMMIT');
    } catch (e) {
        await pool.query('ROLLBACK');
        console.error(`Failed to migrate ${g.mawb}/${g.hawb}`, e);
    }
  }

  console.log(`\nMigration Complete.`);
  console.log(`- Total duplicated events permanently deleted: ${totalEventsDeleted}`);
  console.log(`- Total valid events cleaned & saved to ISO format: ${totalEventsCleaned}`);

  pool.end();
}
main().catch(console.error);
