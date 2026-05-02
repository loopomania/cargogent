import { Router } from "express";
import { authOptional, requireAdmin } from "../middleware/auth.js";
import { getPool } from "../services/db.js";

const router = Router();

/** GET /api/logs?page=1&limit=1000 — paginated query log viewer, admin only. */
router.get("/", authOptional, requireAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 1000);
  const page = Math.max(parseInt(req.query.page as string) || 1, 1);
  const offset = (page - 1) * limit;

  const pool = getPool();
  if (!pool) {
    res.json({ logs: [], total: 0, page, limit });
    return;
  }

  try {
    const countRes = await pool.query("SELECT COUNT(*) as total FROM query_logs");
    const total = parseInt(countRes.rows[0].total);

    const logsRes = await pool.query(
      `SELECT 
        ql.id,
        ql.awb,
        ql.hawb,
        ql.airline_code,
        ql.status,
        ql.duration_ms,
        ql.error_message,
        ql.created_at,
        u.username AS user_name
       FROM query_logs ql
       LEFT JOIN users u ON u.id = ql.user_id
       ORDER BY ql.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({ logs: logsRes.rows, total, page, limit });
  } catch (err) {
    console.error("Failed to read query_logs:", err);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

/** GET /api/logs/batches — lists emails handled and shipments ingested, admin only */
router.get("/batches", authOptional, requireAdmin, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(500).json({ error: "DB not connected" });

  try {
    const result = await pool.query(
      `SELECT 
         b.id, 
         b.ingested_at, 
         b.sender_email, 
         (SELECT COUNT(DISTINCT (master_awb, house_ref)) FROM excel_transport_lines WHERE batch_id = b.id) as shipments_count
       FROM excel_import_batches b
       ORDER BY b.ingested_at DESC
       LIMIT 100`
    );
    res.json({ batches: result.rows });
  } catch (err) {
    console.error("Failed to read excel_import_batches:", err);
    res.status(500).json({ error: "Failed to fetch batches" });
  }
});

export default router;
