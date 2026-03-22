import { Router } from "express";

const router = Router();

// Retrieve n8n webhook URL from environment variables
const N8N_SLACK_WEBHOOK = process.env.N8N_SLACK_WEBHOOK || "";

/**
 * POST /api/alerts/slack
 * Receives severe tracking discrepancies from the admin frontend or tracking engine
 * and asynchronously routes them to n8n for Slack message processing.
 */
router.post("/slack", async (req, res) => {
  const { awb, hawb, discrepancyType, message, severity } = req.body;

  if (!N8N_SLACK_WEBHOOK) {
    res.status(503).json({ error: "N8N_SLACK_WEBHOOK is not configured in backend environment" });
    return;
  }

  try {
    // Fire and forget asynchronous POST to the n8n webhook
    fetch(N8N_SLACK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Pass the extracted discrepancy details cleanly to n8n
      body: JSON.stringify({
        awb,
        hawb,
        discrepancyType,
        message,
        severity,
        timestamp: new Date().toISOString()
      }),
    }).catch(err => {
      console.error("Async Slack Webhook failed to fire in background:", err);
    });

    res.status(202).json({ success: true, message: "Alert dispatched to n8n successfully" });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error dispatching alert" });
  }
});

export default router;
