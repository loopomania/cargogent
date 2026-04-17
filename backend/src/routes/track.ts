import { Router } from "express";
import { trackByAirline, trackByAwb } from "../services/trackService.js";
import { authOptional, requireAuthenticated } from "../middleware/auth.js";
import { logQueryRequest } from "../services/db.js";

const router = Router();

import { getPool } from "../services/db.js";

/** Shared helper: persist a tracking result into query_schedule + leg_status_summary + query_events */
async function saveTrackingResult(
  tenantId: string,
  awb: string,
  hawb: string | undefined,
  data: any
) {
  if (!tenantId) return;
  const p = getPool();
  if (!p) return;

  const mawb = awb.replace(/-/g, "");
  const hawbKey = hawb || mawb;

  // 1. Upsert into query_schedule so it shows up in Tracked List
  await p.query(
    `INSERT INTO query_schedule (tenant_id, mawb, hawb, next_status_check_at)
     VALUES ($1, $2, $3, NOW() + interval '1 hour')
     ON CONFLICT (tenant_id, mawb, hawb) DO UPDATE SET
       next_status_check_at = NOW() + interval '1 hour'`,
    [tenantId, mawb, hawbKey]
  );

  if (data.events && data.events.length > 0) {
    const sorted = [...data.events].sort(
      (a: any, b: any) =>
        new Date((a.date as string) || 0).getTime() -
        new Date((b.date as string) || 0).getTime()
    );
    const ataEvent = sorted.find(
      (e: any) => e.status_code === "ARR" || e.status_code === "RCF"
    )?.date;
    const etaEvent = sorted.find(
      (e: any) => e.status_code === "ARR" || e.status_code === "RCF"
    )?.estimated_date;

    // Derive display status from events (matches MilestonePlan logic)
    const hasDlv = data.events.some((e: any) => e.status_code === "DLV");
    const latestEvent = sorted[sorted.length - 1];
    const derivedStatus = hasDlv
      ? "Delivered"
      : latestEvent?.status ?? latestEvent?.status_code ?? data.status ?? "In Transit";

    // 2. Upsert leg_status_summary with full snapshot
    await p.query(
      `INSERT INTO leg_status_summary
         (tenant_id, shipment_id, leg_sequence, aggregated_status, last_event_at, summary, updated_at)
       VALUES ($1, $2, 1, $3, NOW(), $4, NOW())
       ON CONFLICT (tenant_id, shipment_id, leg_sequence) DO UPDATE SET
         aggregated_status = EXCLUDED.aggregated_status,
         last_event_at     = EXCLUDED.last_event_at,
         summary           = EXCLUDED.summary,
         updated_at        = EXCLUDED.updated_at`,
      [
        tenantId,
        hawbKey,
        derivedStatus,
        JSON.stringify({
          ata: ataEvent ?? null,
          eta: etaEvent ?? null,
          origin: data.origin ?? null,
          destination: data.destination ?? null,
          airline: data.airline ?? null,
          flight: data.flight ?? null,
          message: data.message ?? null,
          events_count: data.events.length,
        }),
      ]
    );

    // 3. Replace previous events in query_events with fresh set
    await p.query(
      `DELETE FROM query_events WHERE tenant_id = $1 AND mawb = $2 AND hawb = $3`,
      [tenantId, mawb, hawbKey]
    );
    for (const ev of data.events) {
      await p.query(
        `INSERT INTO query_events
           (tenant_id, mawb, hawb, provider, source, occurred_at, status_code, status_text, location, weight, pieces, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          tenantId,
          mawb,
          hawbKey,
          data.airline ?? "unknown",
          ev.source ?? "airline",
          ev.date ? new Date(ev.date).toISOString() : null,
          ev.status_code ?? null,
          ev.status ?? null,
          ev.location ?? null,
          ev.weight ?? null,
          ev.pieces ?? null,
          JSON.stringify(ev),
        ]
      );
    }
  }
}

/** GET /api/track/list — Returns aggregated Tracking Schedule for Admin Dashboard */
router.get("/list", authOptional, requireAuthenticated, async (req, res) => {
  const p = getPool();
  if (!p) {
    res.status(500).json({ error: "DB not connected" });
    return;
  }
  
  try {
    const user = (req as any).user;
    // Explicit dynamic aggregations extracting physical locations and counts
    const query = `
      SELECT 
        q.mawb,
        q.hawb,
        q.next_status_check_at as last_query_date,
        COUNT(DISTINCT e.id) as number_of_legs,
        SUM(COALESCE(e.pieces_pcs, 1)) as number_of_pieces,
        COALESCE(
          NULLIF(MAX(COALESCE(e.leg_load_port, e.raw_excel_row->>'Origin', e.raw_excel_row->>'Load Port/Gateway ID', '')), ''),
          MAX(lss.summary->>'origin'),
          ''
        ) as origin,
        COALESCE(
          NULLIF(MAX(COALESCE(e.leg_discharge_port, e.raw_excel_row->>'Destination', e.raw_excel_row->>'Dest Ctry', '')), ''),
          MAX(lss.summary->>'destination'),
          ''
        ) as destination,
        MAX(lss.summary->>'eta') as eta,
        MAX(lss.summary->>'ata') as ata,
        MAX(lss.aggregated_status) as status
      FROM query_schedule q
      LEFT JOIN excel_transport_lines e ON 
         (e.tenant_id = q.tenant_id AND (
            e.master_awb = q.mawb OR e.raw_excel_row->>'Master' = q.mawb OR e.raw_excel_row->>'Master BL' = q.mawb
         ) AND (
            e.house_ref = q.hawb OR e.raw_excel_row->>'House Ref' = q.hawb OR e.raw_excel_row->>'Full HAWB' = q.hawb OR e.shipment_id = q.hawb
         ))
      LEFT JOIN leg_status_summary lss ON lss.tenant_id = q.tenant_id AND lss.shipment_id = q.hawb
      WHERE q.tenant_id = $1
      GROUP BY q.mawb, q.hawb, q.next_status_check_at
      ORDER BY q.next_status_check_at DESC
      LIMIT 100
    `;
    const pendingQuery = await p.query(query, [user?.tenant_id]);
    res.json({ awbs: pendingQuery.rows });
  } catch (err) {
    console.error("GET /api/track/list error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

/** GET /api/track/stored/:mawb/:hawb — Read persisted events from DB (no live tracker call) */
router.get("/stored/:mawb/:hawb", authOptional, requireAuthenticated, async (req, res) => {
  const p = getPool();
  if (!p) { res.status(500).json({ error: "DB not connected" }); return; }
  const user = (req as any).user;
  const { mawb, hawb } = req.params;
  const mawbClean = mawb.replace(/-/g, "");
  const hawbKey = hawb === mawbClean ? mawbClean : hawb;

  try {
    const summaryRes = await p.query(
      `SELECT aggregated_status, summary, last_event_at, updated_at
       FROM leg_status_summary
       WHERE tenant_id = $1 AND shipment_id = $2
       ORDER BY leg_sequence ASC`,
      [user?.tenant_id, hawbKey]
    );
    const eventsRes = await p.query(
      `SELECT payload, occurred_at, status_code, status_text, location, weight, pieces, source, provider
       FROM query_events
       WHERE tenant_id = $1 AND mawb = $2 AND hawb = $3
       ORDER BY occurred_at ASC NULLS LAST`,
      [user?.tenant_id, mawbClean, hawbKey]
    );

    if (summaryRes.rows.length === 0 && eventsRes.rows.length === 0) {
      res.status(404).json({ error: "No stored data found. Run a live query first." });
      return;
    }

    const summary = summaryRes.rows[0]?.summary ?? {};
    const events = eventsRes.rows.map((r: any) => {
      try { return typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload; }
      catch { return { status_code: r.status_code, status: r.status_text, location: r.location, date: r.occurred_at, weight: r.weight, pieces: r.pieces, source: r.source }; }
    });

    res.json({
      airline: summary.airline ?? "unknown",
      awb: mawbClean,
      hawb: hawbKey,
      origin: summary.origin ?? null,
      destination: summary.destination ?? null,
      status: summaryRes.rows[0]?.aggregated_status ?? null,
      flight: summary.flight ?? null,
      events,
      message: summary.message ?? `Loaded from DB — ${events.length} events`,
      blocked: false,
      raw_meta: { source: "database", last_synced: summaryRes.rows[0]?.updated_at ?? null },
    });
  } catch (err) {
    console.error("GET /api/track/stored error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

/** POST /api/track/run-scheduled — Triggered by n8n or cron to run pending tracking jobs */
router.post("/run-scheduled", async (req, res) => {
  const startMs = Date.now();
  const p = getPool();
  if (!p) {
    res.status(500).json({ error: "DB not connected" });
    return;
  }
  
  try {
    // Fetch up to 20 pending tracking jobs
    const pendingQuery = await p.query(
      `SELECT tenant_id, mawb, hawb FROM query_schedule WHERE next_status_check_at <= now() LIMIT 20`
    );
    
    // Process them asynchronously so we don't hold the n8n request too long
    setTimeout(async () => {
      for (const row of pendingQuery.rows) {
        const startMs = Date.now();
        try {
          // Attempt to physically track via Python microservice
          const { data } = await trackByAwb(row.mawb, row.hawb);
          // Persist all findings (and bump next_status_check_at to NOW() so it qualifies for next n8n trigger or UI)
          await saveTrackingResult(row.tenant_id, row.mawb, row.hawb, data);
          
          const durations = data.raw_meta?.durations as { airline?: number; ground?: number } | undefined;
          const attempts = data.raw_meta?.attempts as { airline?: number; ground?: number } | undefined;
          
          // Log automated airline query to UI
          logQueryRequest(undefined, row.tenant_id, row.mawb, row.hawb, data.airline ?? "auto", data.status || (data.events?.length === 0 ? "No Data" : "Success"), Math.round((durations?.airline ?? 0) * 1000) || Date.now() - startMs);

          // Log automated ground service if invoked
          if (attempts?.ground && attempts.ground > 0) {
            const groundService = data.message?.match(/\| (maman|swissport)/)?.[1] ?? "ground";
            const groundStatus = data.message?.includes("timed_out") ? "Timeout" : data.message?.includes("ground_skipped") ? "Skipped" : data.message?.includes(`${groundService}_synced`) ? data.status || "Success" : "No Data";
            logQueryRequest(undefined, row.tenant_id, row.mawb, row.hawb, groundService, groundStatus, Math.round((durations?.ground ?? 0) * 1000));
          }

        } catch (e) {
          console.error(`Scheduled scan failed for ${row.mawb}:`, e);
          logQueryRequest(undefined, row.tenant_id, row.mawb, row.hawb, "system", "Error", Date.now() - startMs);
          // Safety bump to ensure it's not permanently stuck locked if scraping crashes completely
          await p.query(
            "UPDATE query_schedule SET next_status_check_at = NOW() + interval '15 minutes' WHERE tenant_id = $1 AND mawb = $2 AND hawb = $3", 
            [row.tenant_id, row.mawb, row.hawb]
          );
        }
      }
    }, 0);

    res.json({ message: "Started tracking jobs", count: pendingQuery.rows.length });
  } catch (err) {
    console.error("run-scheduled error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

/** GET /api/track/:airline/:awb — track by airline + AWB. Admin only. (Must be before /:awb.) */
router.get("/:airline/:awb", authOptional, requireAuthenticated, async (req, res) => {
  const { airline, awb } = req.params;
  const { hawb } = req.query;
  if (!airline || !awb) {
    res.status(400).json({ error: "airline and awb required" });
    return;
  }
  const startMs = Date.now();
  try {
    const { data, status } = await trackByAirline(airline, awb, hawb as string);
    const user = (req as any).user;
    const durations = data.raw_meta?.durations as { airline?: number; ground?: number } | undefined;
    const attempts = data.raw_meta?.attempts as { airline?: number; ground?: number } | undefined;
    logQueryRequest(user?.sub, user?.tenant_id, awb, hawb as string, airline, data.status || (data.events?.length === 0 ? "No Data" : "Success"), Math.round((durations?.airline ?? 0) * 1000) || Date.now() - startMs);
    // Log ground service if queried
    if (attempts?.ground && attempts.ground > 0) {
      const groundService = data.message?.match(/\| (maman|swissport)/)?.[1] ?? "ground";
      const groundStatus = data.message?.includes("timed_out") ? "Timeout" : data.message?.includes("ground_skipped") ? "Skipped" : data.message?.includes(`${groundService}_synced`) ? data.status || "Success" : "No Data";
      logQueryRequest(user?.sub, user?.tenant_id, awb, hawb as string, groundService, groundStatus, Math.round((durations?.ground ?? 0) * 1000));
    }
    // Persist to DB so it appears in Tracked List
    await saveTrackingResult(user?.tenant_id, awb, hawb as string | undefined, data);
    res.status(status).json(data);
  } catch (err) {
    console.error("trackByAirline error:", err);
    const user = (req as any).user;
    logQueryRequest(user?.sub, user?.tenant_id, awb, hawb as string, airline, "Error", Date.now() - startMs);
    res.status(502).json({
      airline,
      awb,
      events: [],
      message: err instanceof Error ? err.message : "Track service error",
      blocked: true,
    });
  }
});

/** GET /api/track/:awb — track by AWB only (airline from prefix). Admin only. */
router.get("/:awb", authOptional, requireAuthenticated, async (req, res) => {
  const { awb } = req.params;
  const { hawb } = req.query;
  if (!awb) {
    res.status(400).json({ error: "awb required" });
    return;
  }
  const startMs = Date.now();
  try {
    const { data, status } = await trackByAwb(awb, hawb as string);
    const user = (req as any).user;
    const durations = data.raw_meta?.durations as { airline?: number; ground?: number } | undefined;
    const attempts = data.raw_meta?.attempts as { airline?: number; ground?: number } | undefined;
    // Log airline query
  logQueryRequest(user?.sub, user?.tenant_id, awb, hawb as string, data.airline ?? "unknown", data.status || (data.events?.length === 0 ? "No Data" : "Success"), Math.round((durations?.airline ?? 0) * 1000) || Date.now() - startMs);
    // Log ground service if queried
    if (attempts?.ground && attempts.ground > 0) {
      const groundService = data.message?.match(/\| (maman|swissport)/)?.[1] ?? "ground";
      const groundStatus = data.message?.includes("timed_out") ? "Timeout" : data.message?.includes("ground_skipped") ? "Skipped" : data.message?.includes(`${groundService}_synced`) ? data.status || "Success" : "No Data";
      logQueryRequest(user?.sub, user?.tenant_id, awb, hawb as string, groundService, groundStatus, Math.round((durations?.ground ?? 0) * 1000));
    }
    // Persist to DB so it appears in Tracked List
    await saveTrackingResult(user?.tenant_id, awb, hawb as string | undefined, data);
    res.status(status).json(data);
  } catch (err) {
    console.error("trackByAwb error:", err);
    const user = (req as any).user;
    logQueryRequest(user?.sub, user?.tenant_id, awb, hawb as string, "unknown", "Error", Date.now() - startMs);
    res.status(502).json({
      airline: "unknown",
      awb,
      events: [],
      message: err instanceof Error ? err.message : "Track service error",
      blocked: true,
    });
  }
});

/** POST /api/track/mark-delivered/:mawb/:hawb — Mark a shipment as delivered manually */
router.post("/mark-delivered/:mawb/:hawb", authOptional, requireAuthenticated, async (req, res) => {
  const p = getPool();
  if (!p) { res.status(500).json({ error: "DB not connected" }); return; }
  const user = (req as any).user;
  if (!user?.tenant_id) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { mawb, hawb } = req.params;
  const mawbClean = mawb.replace(/-/g, "");
  const hawbKey = hawb === mawbClean ? mawbClean : hawb;

  try {
    await p.query("BEGIN");
    
    // 1. Remove from query_schedule so it disappears from the view and scheduled tasks
    await p.query(
      `DELETE FROM query_schedule WHERE tenant_id = $1 AND mawb = $2 AND hawb = $3`,
      [user.tenant_id, mawbClean, hawbKey]
    );

    // 2. Add manual DLV event to query_events
    await p.query(
      `INSERT INTO query_events
         (tenant_id, mawb, hawb, provider, source, occurred_at, status_code, status_text, location, weight, pieces, payload)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11)`,
      [
        user.tenant_id,
        mawbClean,
        hawbKey,
        "manual",
        "manual",
        "DLV",
        "Delivered",
        "Manual Entry",
        null, // weight
        null, // pieces
        JSON.stringify({ remarks: "Marked as delivered manually" })
      ]
    );

    // 3. Update leg_status_summary
    await p.query(
      `UPDATE leg_status_summary 
       SET aggregated_status = 'Delivered', updated_at = NOW()
       WHERE tenant_id = $1 AND shipment_id = $2`,
      [user.tenant_id, hawbKey]
    );
    
    await p.query("COMMIT");
    res.json({ ok: true, mawb: mawbClean, hawb: hawbKey });
  } catch (err) {
    await p.query("ROLLBACK").catch(() => {});
    console.error("POST /api/track/mark-delivered error:", err);
    res.status(500).json({ error: "Failed to mark shipment as delivered" });
  }
});

/** DELETE /api/track/remove/:mawb/:hawb — Remove a shipment from all tracking tables */
router.delete("/remove/:mawb/:hawb", authOptional, requireAuthenticated, async (req, res) => {
  const p = getPool();
  if (!p) { res.status(500).json({ error: "DB not connected" }); return; }
  const user = (req as any).user;
  if (!user?.tenant_id) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { mawb, hawb } = req.params;
  const mawbClean = mawb.replace(/-/g, "");
  const hawbKey = hawb === mawbClean ? mawbClean : hawb;

  try {
    await p.query("BEGIN");
    await p.query(
      `DELETE FROM query_schedule WHERE tenant_id = $1 AND mawb = $2 AND hawb = $3`,
      [user.tenant_id, mawbClean, hawbKey]
    );
    await p.query(
      `DELETE FROM query_events WHERE tenant_id = $1 AND mawb = $2 AND hawb = $3`,
      [user.tenant_id, mawbClean, hawbKey]
    );
    await p.query(
      `DELETE FROM leg_status_summary WHERE tenant_id = $1 AND shipment_id = $2`,
      [user.tenant_id, hawbKey]
    );
    await p.query("COMMIT");
    res.json({ ok: true, mawb: mawbClean, hawb: hawbKey });
  } catch (err) {
    await p.query("ROLLBACK").catch(() => {});
    console.error("DELETE /api/track/remove error:", err);
    res.status(500).json({ error: "Failed to remove shipment" });
  }
});

export default router;

