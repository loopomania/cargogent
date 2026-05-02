import { Router } from "express";
import { getPool } from "../services/db.js";

const router = Router();

/**
 * GET /api/notifications/pending
 * Polled by N8N to pull any new notifications waiting to be sent
 */
router.get("/pending", async (req, res) => {
  const p = getPool();
  if (!p) {
    res.status(500).json({ error: "DB not connected" });
    return;
  }

  try {
    // We join the `awb_latest_change` table with `users` via the tenant connection
    // Or we just return the change events. N8N can query the user settings.
    // However, it's easier to join users table right here to provide email and preferences.
    const query = `
      SELECT 
        c.id as change_id,
        c.tenant_id,
        c.mawb,
        c.hawb,
        c.event_type,
        c.payload,
        c.created_at,
        u.email,
        u.incremental_email_interval_hours,
        u.full_report_times_per_day
      FROM awb_latest_change c
      JOIN tenants t ON t.id = c.tenant_id
      JOIN users u ON u.tenant_id = c.tenant_id
      WHERE c.processed_by_n8n = false
      ORDER BY c.created_at ASC
      LIMIT 100
    `;
    
    const result = await p.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error("GET /pending error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

/**
 * POST /api/notifications/mark-processed
 * Sent by N8N after successful processing
 */
router.post("/mark-processed", async (req, res) => {
  const p = getPool();
  if (!p) {
    res.status(500).json({ error: "DB not connected" });
    return;
  }

  const { change_ids } = req.body;
  if (!Array.isArray(change_ids) || change_ids.length === 0) {
    res.json({ success: true, message: "No ids provided" });
    return;
  }

  try {
    const list = change_ids.map((id: string, i: number) => `$${i + 1}`).join(",");
    const query = `
      UPDATE awb_latest_change 
      SET processed_by_n8n = true 
      WHERE id IN (${list})
    `;
    await p.query(query, change_ids);
    res.json({ success: true });
  } catch (err) {
    console.error("POST /mark-processed error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

export default router;
