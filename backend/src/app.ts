import express from "express";
import cors from "cors";
import trackRoutes from "./routes/track.js";
import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import logsRoutes from "./routes/logs.js";
import { config, isDev } from "./config/index.js";
import { ping as dbPing } from "./services/db.js";

const app = express();
app.set("trust proxy", 1);

// CORS: allow origins listed in ALLOWED_ORIGINS (comma-separated) or APP_URL, wildcard in dev.
const buildAllowedOrigins = (): Set<string> | null => {
  if (isDev) return null; // null = allow all
  const raw = process.env.ALLOWED_ORIGINS || process.env.APP_URL || "";
  const origins = raw.split(",").map((o) => o.trim()).filter(Boolean);
  return origins.length > 0 ? new Set(origins) : null;
};
const allowedOrigins = buildAllowedOrigins();

app.use(
  cors({
    origin: allowedOrigins === null
      ? "*"
      : (origin, callback) => {
          // allow server-to-server (no origin header) and listed origins
          if (!origin || allowedOrigins.has(origin)) {
            callback(null, true);
          } else {
            callback(new Error("CORS: origin not allowed"));
          }
        },
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// Internal liveness probe — minimal info, no CORS exposure needed
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// API health — simplified; does not reveal DB connection string or detailed state
app.get("/api/health", async (_req, res) => {
  const dbOk = config.databaseUrl ? await dbPing() : null;
  // Only report ok/error — never expose internal state details to the browser
  res.json({
    status: dbOk === false ? "degraded" : "ok",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/track", trackRoutes);
app.use("/api/logs", logsRoutes);

export default app;
