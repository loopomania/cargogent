import "dotenv/config";

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
} as const;

export const isDev = config.nodeEnv === "development";
export const isProd = config.nodeEnv === "production";
