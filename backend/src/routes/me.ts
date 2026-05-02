import { Router, type Request } from "express";
import { authOptional, requireCustomerRole } from "../middleware/auth.js";
import {
  getUserById,
  getNotificationSettings,
  updateNotificationSettings,
} from "../services/userService.js";
import { listAttentionAwbsForTenant, listOpenAwbsForTenant, listArchivedAwbsForTenant } from "../services/awbReadService.js";

const router = Router();

router.use(authOptional);

/** GET /api/me/settings — notification preferences */
router.get("/settings", requireCustomerRole, async (req, res) => {
  const sub = (req as Request & { user?: { sub: string } }).user?.sub;
  if (!sub) {
    res.status(401).json({ error: "Session expired" });
    return;
  }
  try {
    const settings = await getNotificationSettings(sub);
    if (!settings) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(settings);
  } catch (e) {
    console.error("GET /api/me/settings", e);
    res.status(503).json({ error: "Database not ready; apply migrations (006_customer_settings_and_awb_attention.sql)" });
  }
});

/** PATCH /api/me/settings — update notification preferences */
router.patch("/settings", requireCustomerRole, async (req, res) => {
  const sub = (req as Request & { user?: { sub: string } }).user?.sub;
  if (!sub) {
    res.status(401).json({ error: "Session expired" });
    return;
  }
  const body = req.body as {
    incremental_email_interval_hours?: unknown;
    full_report_times_per_day?: unknown;
  };
  const inc = body.incremental_email_interval_hours;
  const full = body.full_report_times_per_day;
  if (typeof inc !== "number" || !Number.isInteger(inc) || inc < 1 || inc > 4) {
    res.status(400).json({ error: "incremental_email_interval_hours must be an integer from 1 to 4" });
    return;
  }
  if (typeof full !== "number" || !Number.isInteger(full) || full < 0 || full > 4) {
    res.status(400).json({ error: "full_report_times_per_day must be an integer from 0 to 4" });
    return;
  }
  try {
    await updateNotificationSettings(sub, {
      incremental_email_interval_hours: inc,
      full_report_times_per_day: full,
    });
    const settings = await getNotificationSettings(sub);
    res.json(settings);
  } catch (e) {
    console.error("PATCH /api/me/settings", e);
    res.status(503).json({ error: "Database not ready; apply migrations (006_customer_settings_and_awb_attention.sql)" });
  }
});

/** GET /api/me/awbs/attention — default AWBs table (stale 24h + on-ground special) */
router.get("/awbs/attention", requireCustomerRole, async (req, res) => {
  const user = (req as Request & { user?: { sub: string; tenant_id?: string } }).user;
  if (!user?.sub) {
    res.status(401).json({ error: "Session expired" });
    return;
  }
  let tenantId = user.tenant_id;
  let domainName: string | undefined;
  
  const row = await getUserById(user.sub);
  tenantId = tenantId || row?.tenant_id || undefined;
  if (row?.username && row.role !== 'admin') domainName = row.username.split('@')[1];

  if (!tenantId) {
    res.json({ awbs: [] });
    return;
  }
  try {
    const awbs = await listAttentionAwbsForTenant(tenantId, domainName);
    res.json({ awbs });
  } catch (e) {
    console.error("GET /api/me/awbs/attention", e);
    res.status(503).json({ error: "Database query failed; ensure migrations are applied" });
  }
});

/** GET /api/me/awbs/open — standard Open Shipments table (active but not attention) */
router.get("/awbs/open", requireCustomerRole, async (req, res) => {
  const user = (req as Request & { user?: { sub: string; tenant_id?: string } }).user;
  if (!user?.sub) {
    res.status(401).json({ error: "Session expired" });
    return;
  }
  let tenantId = user.tenant_id;
  let domainName: string | undefined;

  const row = await getUserById(user.sub);
  tenantId = tenantId || row?.tenant_id || undefined;
  if (row?.username && row.role !== 'admin') domainName = row.username.split('@')[1];

  if (!tenantId) {
    res.json({ awbs: [] });
    return;
  }
  try {
    const awbs = await listOpenAwbsForTenant(tenantId, domainName);
    res.json({ awbs });
  } catch (e) {
    console.error("GET /api/me/awbs/open", e);
    res.status(503).json({ error: "Database query failed" });
  }
});

/** GET /api/me/awbs/archived — historical Archived Shipments table (paginated) */
router.get("/awbs/archived", requireCustomerRole, async (req, res) => {
  const user = (req as Request & { user?: { sub: string; tenant_id?: string } }).user;
  if (!user?.sub) {
    res.status(401).json({ error: "Session expired" });
    return;
  }
  let tenantId = user.tenant_id;
  let domainName: string | undefined;

  const row = await getUserById(user.sub);
  tenantId = tenantId || row?.tenant_id || undefined;
  if (row?.username && row.role !== 'admin') domainName = row.username.split('@')[1];

  if (!tenantId) {
    res.json({ data: [], total: 0 });
    return;
  }

  const page = parseInt(req.query.page as string || "1", 10);
  const limit = parseInt(req.query.limit as string || "100", 10);
  const search = req.query.search as string || "";

  try {
    const result = await listArchivedAwbsForTenant(tenantId, page, limit, search, domainName);
    res.json(result);
  } catch (e) {
    console.error("GET /api/me/awbs/archived", e);
    res.status(503).json({ error: "Database query failed" });
  }
});

export default router;
