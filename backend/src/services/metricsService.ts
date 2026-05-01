import newrelic from "newrelic";
import { getPool } from "./db.js";

/**
 * Service to periodically report custom business metrics to New Relic.
 */
export class MetricsService {
  private static interval: NodeJS.Timeout | null = null;

  /**
   * Starts the periodic metrics reporting.
   * @param intervalMs How often to report metrics (default 5 minutes).
   */
  static start(intervalMs: number = 5 * 60 * 1000) {
    if (this.interval) return;
    
    console.log("Starting New Relic Custom Metrics Service...");
    
    // Run once immediately
    this.reportMetrics();
    
    this.interval = setInterval(() => {
      this.reportMetrics();
    }, intervalMs);
  }

  static stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private static async reportMetrics() {
    try {
      const pool = getPool();
      if (!pool) return;

      // 1. Active Shipments Count
      // Defined as shipments in query_schedule that have not been delivered/archived
      const activeShipmentsRes = await pool.query(
        "SELECT COUNT(*) as count FROM query_schedule"
      );
      const activeShipments = parseInt(activeShipmentsRes.rows[0]?.count || "0", 10);
      newrelic.recordMetric("Custom/Shipments/Active", activeShipments);

      // 2. Total Shipments Tracked
      const totalEventsRes = await pool.query(
        "SELECT COUNT(*) as count FROM query_events"
      );
      const totalEvents = parseInt(totalEventsRes.rows[0]?.count || "0", 10);
      newrelic.recordMetric("Custom/Shipments/TotalEvents", totalEvents);

      // 3. Error Rate (Consecutive Errors > 0)
      const errorShipmentsRes = await pool.query(
        "SELECT COUNT(*) as count FROM query_schedule WHERE error_count_consecutive > 0"
      );
      const errorShipments = parseInt(errorShipmentsRes.rows[0]?.count || "0", 10);
      newrelic.recordMetric("Custom/Shipments/WithErrors", errorShipments);

      // 4. Distribution by Airline (Top 5)
      const airlineDistRes = await pool.query(
        "SELECT substring(mawb, 1, 3) as prefix, COUNT(*) as count FROM query_schedule GROUP BY prefix ORDER BY count DESC LIMIT 5"
      );
      airlineDistRes.rows.forEach(row => {
        newrelic.recordMetric(`Custom/Airlines/${row.prefix}/Active`, parseInt(row.count, 10));
      });

      console.log(`[Metrics] Reported ${activeShipments} active shipments to New Relic.`);
    } catch (err) {
      console.error("Failed to report custom metrics to New Relic:", err);
    }
  }
}
