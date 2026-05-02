/**
 * RV: DHL ACS public page vs CargoGent milestone engine (same ingestion shape as AWBTrackers).
 *
 * Usage:
 *   cd backend && npx tsx scratch/rv_system_vs_dhl_acs.ts [MAWB_11_DIGITS]
 *
 * Does not call CargoGent APIs (no JWT). "System" = computeMilestoneProjection on parsed airline events.
 */

import { computeMilestoneProjection, type MilestoneEvent } from "../src/services/milestoneEngine.js";

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function cleanAcsRemark(desc: string): string {
  return desc.replace(/\+ Show content[\s\S]*$/i, "").replace(/\s+/g, " ").trim();
}

function parseDhlAcsTable(html: string): {
  events: MilestoneEvent[];
  dhlPieces: number | null;
  dhlOrigin: string | null;
  dhlDest: string | null;
  dhlSummaryLast: string | null;
  dhlSummaryTime: string | null;
} {
  const piecesM = html.match(/<span class="font-weight-bold">(\d+)<\/span>\s*pieces/s);
  const dhlPieces = piecesM ? parseInt(piecesM[1], 10) : null;

  const orgM = html.match(/From DHL Org.*?<span class="font-weight-bold">([A-Z]{3})<\/span>/s);
  const destM = html.match(/to DHL Dest\s*<span class="font-weight-bold">([A-Z]{3})<\/span>/s);

  const summaryTimeM = html.match(
    /<span class="font-weight-bold">(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),\s+([^<]+)<\/span>/,
  );
  const summaryStatusM = html.match(
    /<td class="status-container">([\s\S]*?)<\/td>\s*<td><span class="font-weight-bold">Destination:/,
  );

  const tableM = html.match(/<table class="table tracking-results">([\s\S]*?)<\/table>/);
  const table = tableM?.[1] ?? "";
  let currentDate = ""; // e.g. Friday, May 1, 2026
  const rawRows: { dt: string; code: string; loc: string; time: string; desc: string; qtyNum: string }[] = [];

  const rowBlocks = table.split("<tr>");
  for (const block of rowBlocks) {
    const hd = block.match(
      /<th[^>]*colspan="2"[^>]*>\s*([^<]+)\s*<\/th>/,
    );
    if (hd) {
      currentDate = hd[1].trim();
      continue;
    }
    const m = block.match(
      /<td>\s*([A-Za-z]*)\s*<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>/,
    );
    if (!m || !currentDate) continue;
    const desc = cleanAcsRemark(stripTags(m[2]));
    let code = m[1].trim().toUpperCase();
    if (!code && /\bscheduled for movement\b/i.test(desc)) code = "SFM";
    if (!code) continue;
    const loc = m[4].trim();
    const qtyCell = stripTags(m[3]);
    const qtyNum = qtyCell.match(/(\d+)/)?.[1] ?? "1";
    const hhmm = m[6].trim();
    rawRows.push({
      dt: `${currentDate} ${hhmm}`,
      code,
      loc,
      time: hhmm,
      desc,
      qtyNum,
    });
  }

  /** ACS lists newest-first — engine expects chronological */

  rawRows.reverse();

  const events: MilestoneEvent[] = [];
  for (const r of rawRows) {
    const isoLike = normalizeDhlLocalDate(r.dt);
    const mov = r.desc.match(/\bmovement\s+([A-Z0-9]+)\s+to\s+([A-Z]{3})\b/i);
    const flight = mov?.[1] ?? undefined;
    const code = r.code === "FFM" ? "MAN" : r.code;

    events.push({
      status_code: code,
      status: r.desc,
      location: `${r.loc}`,
      date: isoLike,
      remarks: r.desc,
      flight,
      pieces: r.qtyNum,
      source: "airline",
    });
  }

  return {
    events,
    dhlPieces,
    dhlOrigin: orgM?.[1] ?? null,
    dhlDest: destM?.[1] ?? null,
    dhlSummaryLast: summaryStatusM ? stripTags(summaryStatusM[1]) : null,
    dhlSummaryTime: summaryTimeM ? `${summaryTimeM[1]}, ${summaryTimeM[2].trim()}` : null,
  };
}

/** "Friday, May 1, 2026 00:09" parsed in local-ish way → ISO UTC approximation (same calendar day + time). */


function normalizeDhlLocalDate(s: string): string {
  const m = s.match(/^(\w+),\s+(\w+)\s+(\d{1,2}),\s+(\d{4})\s+(\d{2}:\d{2})$/);


  if (!m) return s;
  const months: Record<string, string> = {
    january: "01",

    february: "02",
    march: "03",
    april: "04",
    may: "05",

    june: "06",
    july: "07",

    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
  };


  const mon = months[m[2].toLowerCase()] ?? "01";
  const dd = m[3].padStart(2, "0");
  const yyyy = m[4];
  const hhmm = m[5];


  return `${yyyy}-${mon}-${dd}T${hhmm}:00.000Z`;
}

async function main() {
  const awb = (process.argv[2] ?? "61566487890").replace(/\D/g, "");

  const url = `https://aviationcargo.dhl.com/track/${awb}`;


  const res = await fetch(url, {


    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
    },
  });
  const html = await res.text();


  const { events, dhlPieces, dhlOrigin, dhlDest, dhlSummaryLast, dhlSummaryTime } = parseDhlAcsTable(html);


  const proj = computeMilestoneProjection({
    events,

    origin: dhlOrigin,
    destination: dhlDest,
    status: null,
    excelLegs: [],
    excelPiecesHint: dhlPieces ?? 1,
  });

  const nodes = proj.flows_steps[0]?.filter(s => s.kind === "node") ?? [];


  const depNodes = nodes.filter(s => s.kind === "node" && s.code === "DEP");


  const arrNodes = nodes.filter(s => s.kind === "node" && s.code === "ARR");


  console.log(`URL: ${url}`);
  console.log("");
  console.log("--- DHL (public ACS page) ---");
  console.log(`  MAWB: ${awb}`);
  console.log(`  Routed (headline): ${dhlOrigin ?? "?"} → ${dhlDest ?? "?"}`);


  console.log(`  Pieces: ${dhlPieces ?? "?"}`);


  console.log(`  Summary time: ${dhlSummaryTime ?? "?"}`);


  console.log(`  Summary status: ${dhlSummaryLast ?? "?"}`);


  console.log(`  Detail rows parsed: ${events.length}`);


  console.log("");


  console.log("--- System (milestone_projection) ---");


  console.log(`  overall_status: ${proj.meta.overall_status}`);


  console.log(`  paths_count: ${proj.meta.paths_count}`);


  console.log(`  max_pieces (from events): ${proj.meta.max_pieces}`);


  console.log(`  origin_display→dest_display: ${proj.origin_display} → ${proj.dest_display}`);


  console.log(`  DEP nodes: ${depNodes.length}`, depNodes.map(n => `${n.location}@${n.date?.slice(0, 16) ?? "?"}flt=${n.flight ?? ""}`));


  console.log(`  ARR nodes: ${arrNodes.length}`, arrNodes.map(n => `${n.location}@${n.date?.slice(0, 16) ?? "?"}`));

  const mismatches: string[] = [];


  if (dhlPieces != null && proj.meta.max_pieces !== dhlPieces) mismatches.push(`pieces: DHL=${dhlPieces} system_max=${proj.meta.max_pieces}`);
  if ((dhlOrigin && proj.origin_display !== dhlOrigin) || (dhlDest && proj.dest_display !== dhlDest))

    mismatches.push(`lane: DHL ${dhlOrigin}→${dhlDest} vs system ${proj.origin_display}→${proj.dest_display}`);


  const chron = [...events].sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());

  const lastEv = chron.at(-1);


  const o = proj.meta.overall_status.toLowerCase();


  /** Rough alignment: condensation line should reflect the freshest scan (DEP / MAN / SFM, not stale ARR). */
  let lastOk = false;
  if (lastEv?.status_code === "DEP") {
    lastOk =
      /\b(depart|manifest|movement)\b/i.test(proj.meta.overall_status) ||
      /\bfacility\b/i.test(proj.meta.overall_status);
  } else if (lastEv?.status_code === "SFM") {
    lastOk = /\bscheduled\b/i.test(proj.meta.overall_status) || /\bmovement\b/i.test(proj.meta.overall_status);
  } else if (lastEv?.status_code === "MAN") {
    lastOk = /\bmanifest\b/i.test(o) || /\bmovement\b/i.test(proj.meta.overall_status);
  } else if (lastEv) {
    const tip = `${lastEv.status ?? ""} ${lastEv.remarks ?? ""}`.toLowerCase();
    lastOk =
      tip.length < 6 ||
      tip.includes(o.slice(0, Math.min(24, o.length))) ||
      o.includes(tip.slice(0, Math.min(24, tip.length)));
  } else {
    lastOk = true;
  }

  if ((dhlSummaryLast ?? "").toLowerCase().includes("scheduled for movement")) {
    if (!/\bscheduled\b/i.test(proj.meta.overall_status)) {
      mismatches.push(`headline expects Scheduled for Movement, got "${proj.meta.overall_status}"`);
    }
  }

  if (!lastOk) mismatches.push(`latest narrative mismatch for last=${lastEv?.status_code}: "${proj.meta.overall_status}"`);

  console.log("");
  console.log(mismatches.length ? `RV FAIL: ${mismatches.join("; ")}` : "RV PASS: headline + pieces + pathing aligned with ACS feed");

  process.exit(mismatches.length ? 2 : 0);
}

main().catch(e => {


  console.error(e);


  process.exit(1);

});
