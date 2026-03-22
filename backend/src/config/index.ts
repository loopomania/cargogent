import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Determine which .env file to use based on the environment
const isProdEnv = process.env.NODE_ENV === "production";
const envFileName = isProdEnv ? ".env-prod" : ".env-dev";
const envPath = path.resolve(process.cwd(), "..", envFileName);

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  // Fallback if running from the frontend directory or nested
  const fallbackPath = path.resolve(process.cwd(), "../../", envFileName);
  if (fs.existsSync(fallbackPath)) {
    dotenv.config({ path: fallbackPath });
  } else {
    // Basic fallback, just in case
    dotenv.config();
  }
}


const env = process.env;

export const config = {
  nodeEnv: env.NODE_ENV ?? "development",
  port: parseInt(env.PORT ?? "3000", 10),

  /** URL of AWBTrackers service (Python). Backend proxies /api/track to this. */
  awbTrackersUrl: (env.AWBTRACKERS_URL ?? "http://awbtrackers:8000").replace(/\/$/, ""),

  /** Dev: postgres connection. Prod: Neon REST (set NEON_REST_URL + NEON_API_KEY). */
  databaseUrl: env.DATABASE_URL,

  /** Neon Auth (production). Backend validates JWT using JWKS. */
  neonAuthUrl: env.NEON_AUTH_URL,
  neonJwksUrl: env.NEON_JWKS_URL,
  neonRestUrl: env.NEON_REST_URL,
  neonApiKey: env.NEON_API_KEY,

  /** First admin (seed). Used by POST /api/auth/login when no Neon Auth. */
  adminEmail: (env.ADMIN_EMAIL ?? "").trim().toLowerCase(),
  adminPasswordHash: env.ADMIN_PASSWORD_HASH ?? "",

  /** JWT signing secret for login token. Required in prod so track API can verify auth. */
  jwtSecret: env.JWT_SECRET ?? (env.NODE_ENV === "production" ? "" : "dev-secret-change-in-prod"),

  /** SMTP Email Configuration for sending magic links and keys */
  smtpHost: env.SMTP_HOST || "",
  smtpPort: parseInt(env.SMTP_PORT || "587", 10),
  smtpUser: env.SMTP_USER || "",
  smtpPass: env.SMTP_PASS || "",
  smtpFrom: env.SMTP_FROM || '"CargoGent" <noreply@cargogent.com>',

  /** n8n webhook URL for user invitation and password-reset emails. Falls back to SMTP if unset. */
  n8nInviteWebhookUrl: env.N8N_INVITE_WEBHOOK_URL || "",

  /** HIGH-01: Comma-separated list of allowed CORS origins. Defaults to localhost for dev. */
  allowedOrigins: (env.ALLOWED_ORIGINS ?? "http://localhost")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  /** HIGH-02: Canonical app URL used in email links. Never derived from request Host header. */
  appUrl: (env.APP_URL ?? "http://localhost").replace(/\/$/, ""),
} as const;

export const isDev = config.nodeEnv === "development";
export const isProd = config.nodeEnv === "production";
