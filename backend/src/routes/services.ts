import { Router } from "express";
import net from "net";
import { authOptional, requireAdmin } from "../middleware/auth.js";
import { ping as dbPing } from "../services/db.js";
import { config } from "../config/index.js";

const router = Router();

export type ServiceStatus = "active" | "degraded" | "offline" | "suspended";

export interface ServiceHealth {
  id: string;
  name: string;
  description: string;
  status: ServiceStatus;
  latency_ms: number | null;
  detail: string | null;
  checked_at: string;
}

// ─── probe helpers ────────────────────────────────────────────────────────────

/** Timed HTTP GET — returns { ok, latency_ms, detail } */
async function probeHttp(
  url: string,
  opts: { timeoutMs?: number; proxyUrl?: string } = {}
): Promise<{ ok: boolean; latency_ms: number | null; detail: string | null }> {
  const timeoutMs = opts.timeoutMs ?? 6_000;
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latency_ms = Date.now() - t0;
    if (!res.ok) {
      return { ok: false, latency_ms, detail: `HTTP ${res.status}` };
    }
    return { ok: true, latency_ms, detail: null };
  } catch (err: any) {
    const latency_ms = Date.now() - t0;
    const msg: string = err?.message ?? "Unknown error";
    return { ok: false, latency_ms, detail: msg.slice(0, 120) };
  }
}

/** TCP connect probe — returns { ok, latency_ms, detail } */
function probeTcp(
  host: string,
  port: number,
  timeoutMs = 6_000
): Promise<{ ok: boolean; latency_ms: number | null; detail: string | null }> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const done = (ok: boolean, detail: string | null) => {
      if (settled) return;
      settled = true;
      const latency_ms = Date.now() - t0;
      socket.destroy();
      resolve({ ok, latency_ms, detail });
    };

    socket.setTimeout(timeoutMs);
    socket.connect(port, host, () => done(true, null));
    socket.on("error", (err) => done(false, err.message.slice(0, 120)));
    socket.on("timeout", () => done(false, "TCP connect timeout"));
  });
}

function statusFromProbe(
  ok: boolean,
  latency_ms: number | null,
  degradedThresholdMs = 3_000
): ServiceStatus {
  if (!ok) return "offline";
  if (latency_ms != null && latency_ms > degradedThresholdMs) return "degraded";
  return "active";
}

// ─── individual probes ────────────────────────────────────────────────────────

async function checkAwbTrackers(): Promise<ServiceHealth> {
  const url = `${config.awbTrackersUrl}/health`;
  const { ok, latency_ms, detail } = await probeHttp(url, { timeoutMs: 8_000 });
  return {
    id: "awbtrackers",
    name: "AWBTrackers",
    description: "Python scraping service for airline tracking",
    status: statusFromProbe(ok, latency_ms),
    latency_ms,
    detail,
    checked_at: new Date().toISOString(),
  };
}

async function checkDatabase(): Promise<ServiceHealth> {
  const t0 = Date.now();
  let ok = false;
  let detail: string | null = null;
  try {
    ok = (await dbPing()) !== false;
  } catch (err: any) {
    detail = err?.message?.slice(0, 120) ?? "Unknown error";
  }
  const latency_ms = Date.now() - t0;
  if (!config.databaseUrl) {
    return {
      id: "postgres",
      name: "PostgreSQL",
      description: "Primary application database",
      status: "offline",
      latency_ms: null,
      detail: "DATABASE_URL not configured",
      checked_at: new Date().toISOString(),
    };
  }
  return {
    id: "postgres",
    name: "PostgreSQL",
    description: "Primary application database",
    status: statusFromProbe(ok, latency_ms),
    latency_ms: ok ? latency_ms : null,
    detail,
    checked_at: new Date().toISOString(),
  };
}

async function checkProxy(): Promise<ServiceHealth> {
  const proxyUrl = process.env.PROXY_URL ?? "";
  if (!proxyUrl) {
    return {
      id: "proxy",
      name: "Residential Proxy",
      description: "Rotating proxy for anti-bot airline scrapers",
      status: "offline",
      latency_ms: null,
      detail: "PROXY_URL not configured",
      checked_at: new Date().toISOString(),
    };
  }

  // Parse host/port from proxy URL and do a TCP probe (avoids making a real outbound request)
  try {
    const parsed = new URL(proxyUrl);
    const host = parsed.hostname;
    const port = parsed.port ? parseInt(parsed.port) : (parsed.protocol === "https:" ? 443 : 80);
    const { ok, latency_ms, detail } = await probeTcp(host, port, 7_000);
    return {
      id: "proxy",
      name: "Residential Proxy",
      description: "Rotating proxy for anti-bot airline scrapers",
      status: statusFromProbe(ok, latency_ms, 4_000),
      latency_ms,
      detail,
      checked_at: new Date().toISOString(),
    };
  } catch {
    return {
      id: "proxy",
      name: "Residential Proxy",
      description: "Rotating proxy for anti-bot airline scrapers",
      status: "offline",
      latency_ms: null,
      detail: "Invalid PROXY_URL format",
      checked_at: new Date().toISOString(),
    };
  }
}

async function checkN8n(): Promise<ServiceHealth> {
  const webhookBase = config.n8nInviteWebhookUrl;
  if (!webhookBase) {
    return {
      id: "n8n",
      name: "n8n Workflows",
      description: "Automation engine for email handling and notifications",
      status: "offline",
      latency_ms: null,
      detail: "N8N_INVITE_WEBHOOK_URL not configured",
      checked_at: new Date().toISOString(),
    };
  }

  // Derive the n8n base URL from the webhook URL (strip /webhook/... path)
  let n8nBase: string;
  try {
    const parsed = new URL(webhookBase);
    n8nBase = `${parsed.protocol}//${parsed.host}`;
  } catch {
    n8nBase = webhookBase;
  }

  const { ok, latency_ms, detail } = await probeHttp(`${n8nBase}/healthz`, { timeoutMs: 6_000 });
  return {
    id: "n8n",
    name: "n8n Workflows",
    description: "Automation engine for email handling and notifications",
    status: statusFromProbe(ok, latency_ms),
    latency_ms,
    detail,
    checked_at: new Date().toISOString(),
  };
}

async function checkSmtp(): Promise<ServiceHealth> {
  const host = config.smtpHost;
  const port = config.smtpPort;
  if (!host) {
    return {
      id: "smtp",
      name: "SMTP",
      description: "Email delivery for alerts and user notifications",
      status: "offline",
      latency_ms: null,
      detail: "SMTP_HOST not configured",
      checked_at: new Date().toISOString(),
    };
  }
  const { ok, latency_ms, detail } = await probeTcp(host, port, 7_000);
  return {
    id: "smtp",
    name: "SMTP",
    description: "Email delivery for alerts and user notifications",
    status: statusFromProbe(ok, latency_ms, 4_000),
    latency_ms,
    detail,
    checked_at: new Date().toISOString(),
  };
}

async function checkNewRelic(): Promise<ServiceHealth> {
  const licenseKey = process.env.NEW_RELIC_LICENSE_KEY ?? "";
  if (!licenseKey) {
    return {
      id: "newrelic",
      name: "New Relic",
      description: "APM and infrastructure observability",
      status: "offline",
      latency_ms: null,
      detail: "NEW_RELIC_LICENSE_KEY not configured",
      checked_at: new Date().toISOString(),
    };
  }
  // Probe New Relic collector endpoint (public, no auth needed to verify reachability)
  const { ok, latency_ms, detail } = await probeHttp(
    "https://collector.newrelic.com/",
    { timeoutMs: 8_000 }
  );
  return {
    id: "newrelic",
    name: "New Relic",
    description: "APM and infrastructure observability",
    // New Relic collector returns non-2xx for bare GET — treat as reachable if latency is low
    status: latency_ms != null && latency_ms < 5_000 ? "active" : "offline",
    latency_ms,
    detail: ok ? null : (detail ?? null),
    checked_at: new Date().toISOString(),
  };
}

// ─── routes ───────────────────────────────────────────────────────────────────

/** GET /api/services/status — returns live health of all external services. Admin only. */
router.get("/status", authOptional, requireAdmin, async (_req, res) => {
  const results = await Promise.allSettled([
    checkAwbTrackers(),
    checkDatabase(),
    checkProxy(),
    checkN8n(),
    checkSmtp(),
    checkNewRelic(),
  ]);

  const services: ServiceHealth[] = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    const ids = ["awbtrackers", "postgres", "proxy", "n8n", "smtp", "newrelic"];
    return {
      id: ids[i] ?? `service-${i}`,
      name: ids[i] ?? `Service ${i}`,
      description: "",
      status: "offline" as ServiceStatus,
      latency_ms: null,
      detail: r.reason?.message ?? "Probe failed",
      checked_at: new Date().toISOString(),
    };
  });

  res.json({ services });
});

export interface CircuitBreakerEntry {
  airline: string;
  status: "closed" | "degraded" | "tripped";
  failures: number;
  max_failures: number;
  cooldown_seconds: number;
  cooldown_remaining_s: number | null;
  blocked_until: number | null;
}

/**
 * GET /api/services/circuit-breakers — proxies the live circuit-breaker table
 * from the AWBTrackers Python service. Admin only.
 */
router.get("/circuit-breakers", authOptional, requireAdmin, async (_req, res) => {
  const url = `${config.awbTrackersUrl}/circuit-breakers`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!r.ok) {
      res.status(502).json({ error: `AWBTrackers returned HTTP ${r.status}` });
      return;
    }
    const data = await r.json();
    res.json(data); // { circuit_breakers: CircuitBreakerEntry[] }
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? "AWBTrackers unreachable" });
  }
});

export interface AwbTrackingStats {
  total_active: number;
  halted: number;
  due_now: number;
  errors_3plus: number;
  by_airline: { prefix: string; count: number }[];
  checked_at: string;
}

/**
 * GET /api/services/awb-tracking — returns queue-level stats from the DB.
 * Admin only.
 */
router.get("/awb-tracking", authOptional, requireAdmin, async (_req, res) => {
  const { getPool } = await import("../services/db.js");
  const p = getPool();
  if (!p) {
    res.status(503).json({ error: "DB not connected" });
    return;
  }

  try {
    const [summary, byAirline] = await Promise.all([
      p.query<{
        total_active: string;
        halted: string;
        due_now: string;
        errors_3plus: string;
      }>(
        `SELECT
           COUNT(*)                                           AS total_active,
           COUNT(*) FILTER (WHERE is_halted = true)          AS halted,
           COUNT(*) FILTER (WHERE next_status_check_at <= NOW() AND is_halted = false) AS due_now,
           COUNT(*) FILTER (WHERE error_count_consecutive >= 3)                       AS errors_3plus
         FROM query_schedule`
      ),
      p.query<{ prefix: string; count: string }>(
        `SELECT LEFT(mawb, 3) AS prefix, COUNT(*) AS count
         FROM query_schedule
         GROUP BY prefix
         ORDER BY count DESC
         LIMIT 20`
      ),
    ]);

    const row = summary.rows[0];
    const stats: AwbTrackingStats = {
      total_active: parseInt(row.total_active, 10),
      halted: parseInt(row.halted, 10),
      due_now: parseInt(row.due_now, 10),
      errors_3plus: parseInt(row.errors_3plus, 10),
      by_airline: byAirline.rows.map((r) => ({
        prefix: r.prefix,
        count: parseInt(r.count, 10),
      })),
      checked_at: new Date().toISOString(),
    };

    res.json(stats);
  } catch (err: any) {
    console.error("GET /api/services/awb-tracking error:", err);
    res.status(500).json({ error: "Failed to fetch AWB tracking stats" });
  }
});

export interface TrackerEntry {
  key: string;
  display: string;
  iata_codes: string[];
  awb_prefixes: string[];
  proxy: "none" | "standard" | "premium" | "unknown";
  cb_status: "closed" | "degraded" | "tripped";
  cb_failures: number;
  cb_max_failures: number;
  cooldown_remaining_s: number | null;
}

/**
 * GET /api/services/trackers — proxies the live tracker list from AWBTrackers.
 * Returns every supported airline with metadata + live circuit-breaker state.
 * Admin only.
 */
router.get("/trackers", authOptional, requireAdmin, async (_req, res) => {
  const url = `${config.awbTrackersUrl}/trackers`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!r.ok) {
      res.status(502).json({ error: `AWBTrackers returned HTTP ${r.status}` });
      return;
    }
    const data = await r.json();
    res.json(data); // { trackers: TrackerEntry[] }
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? "AWBTrackers unreachable" });
  }
});

export default router;

