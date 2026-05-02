import "newrelic";
import app from "./app.js";
import { config, isProd } from "./config/index.js";
import { MetricsService } from "./services/metricsService.js";

if (isProd && (!config.jwtSecret || config.jwtSecret === "dev-secret-change-in-prod")) {
  console.error("FATAL: JWT_SECRET environment variable is missing or insecure in production.");
  process.exit(1);
}

app.listen(config.port, () => {
  console.log(`Cargogent backend listening on port ${config.port}`);
  MetricsService.start();
});
