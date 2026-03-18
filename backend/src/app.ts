import express from "express";
import cors from "cors";
import trackRoutes from "./routes/track.js";
import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import logsRoutes from "./routes/logs.js";
import { config } from "./config/index.js";
import { ping as dbPing } from "./services/db.js";

const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "cargogent-backend" });
});
app.get("/api/health", async (_req, res) => {
  const dbOk = config.databaseUrl ? await dbPing() : null;
  res.json({
    status: "ok",
    service: "cargogent-backend",
    database: config.databaseUrl ? (dbOk ? "connected" : "error") : "not_configured",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/track", trackRoutes);
app.use("/api/logs", logsRoutes);

export default app;
