import { Router } from "express";
import { trackByAirline, trackByAwb } from "../services/trackService.js";
import { authOptional, requireAuthenticated } from "../middleware/auth.js";
import { logQueryRequest } from "../services/db.js";

const router = Router();

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
    // Log airline query
    logQueryRequest(user?.sub, user?.tenant_id, awb, hawb as string, airline, data.status || "Success", Math.round((durations?.airline ?? 0) * 1000) || Date.now() - startMs);
    // Log ground service if queried
    if (attempts?.ground && attempts.ground > 0) {
      const groundService = data.message?.match(/\| (maman|swissport)/)?.[1] ?? "ground";
      const groundStatus = data.message?.includes("timed_out") ? "Timeout" : data.message?.includes("ground_skipped") ? "Skipped" : data.message?.includes(`${groundService}_synced`) ? data.status || "Success" : "No Data";
      logQueryRequest(user?.sub, user?.tenant_id, awb, hawb as string, groundService, groundStatus, Math.round((durations?.ground ?? 0) * 1000));
    }
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
    logQueryRequest(user?.sub, user?.tenant_id, awb, hawb as string, data.airline, data.status || "Success", Math.round((durations?.airline ?? 0) * 1000) || Date.now() - startMs);
    // Log ground service if queried
    if (attempts?.ground && attempts.ground > 0) {
      const groundService = data.message?.match(/\| (maman|swissport)/)?.[1] ?? "ground";
      const groundStatus = data.message?.includes("timed_out") ? "Timeout" : data.message?.includes("ground_skipped") ? "Skipped" : data.message?.includes(`${groundService}_synced`) ? data.status || "Success" : "No Data";
      logQueryRequest(user?.sub, user?.tenant_id, awb, hawb as string, groundService, groundStatus, Math.round((durations?.ground ?? 0) * 1000));
    }
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

export default router;
