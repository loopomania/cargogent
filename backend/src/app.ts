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

// CORS: In prod restrict to the APP_URL origin; in dev allow all for local tooling
const allowedOrigin = process.env.APP_URL ?? (isDev ? "*" : "");
app.use(
  cors({
    origin: isDev ? "*" : (origin, callback) => {
      if (!origin || origin === allowedOrigin) {
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
