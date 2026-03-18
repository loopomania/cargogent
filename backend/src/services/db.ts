import pg from "pg";
import { config } from "../config/index.js";

let pool: pg.Pool | null = null;

/**
 * Get Postgres pool (dev). In prod, use Neon REST client instead.
 */
export function getPool(): pg.Pool | null {
  if (!config.databaseUrl) return null;
  if (!pool) {
    pool = new pg.Pool({ connectionString: config.databaseUrl });
  }
  return pool;
}

/**
 * Run SELECT 1 to verify DB connectivity. Returns true if OK, false if no DB or error.
 */
export async function ping(): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  try {
    const client = await p.connect();
    try {
      await client.query("SELECT 1");
      return true;
    } finally {
      client.release();
    }
  } catch {
    return false;
  }
}

/**
 * Log a tracked query attempt into the database (fire-and-forget).
 */
export async function logQueryRequest(
  userId: string | undefined,
  tenantId: string | undefined,
  awb: string,
  hawb: string | undefined | null,
  airlineCode: string,
  status: string,
  durationMs: number
): Promise<void> {
  const p = getPool();
  if (!p) return;
  
  try {
    const query = `
      INSERT INTO query_logs (user_id, tenant_id, awb, hawb, airline_code, status, duration_ms)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    const values = [
      userId || null,
      tenantId || null,
      awb,
      hawb || null,
      airlineCode,
      status,
      durationMs,
    ];
    await p.query(query, values);
  } catch (err) {
    console.error("Failed to log tracking query request:", err);
  }
}
