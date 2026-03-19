import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import trackRoutes from "./routes/track.js";
import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import logsRoutes from "./routes/logs.js";
import { config, isDev } from "./config/index.js";
import { ping as dbPing } from "./services/db.js";

const app = express();
app.set("trust proxy", 1);

// HIGH-01: Restrict CORS to explicitly allowed origins only.
// credentials: true is required for the HttpOnly session cookie to be sent cross-origin.
app.use(
  cors({
    origin: config.allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
// HIGH-04: Parse cookies so authOptional can read the session cookie.
app.use(cookieParser());

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
