import { Router } from "express";
import multer from "multer";
import { getPool } from "../services/db.js";
import { parseExcelBuffer } from "../services/excelParser.js";
import { processIngestedExcel } from "../services/ingestService.js";

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

// GET /api/ingest/allowed-domains
// Fetches the secure list of whitelisted sender domains globally registered in the database for N8N filtering
router.get("/allowed-domains", async (req, res) => {
  try {
    const p = getPool();
    if (!p) return res.status(500).json({ error: "DB not connected" });

    const result = await p.query(
      `SELECT DISTINCT split_part(username, '@', 2) as domain FROM users WHERE username LIKE '%@%'`
    );
    const domains = result.rows.map(r => r.domain.toLowerCase()) || [];
    
    return res.json({ domains });
  } catch (err) {
    console.error("[Allowed Domains Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/ingest/webhook
// Called by n8n triggered by incoming IMAP email via multipart/form-data
router.post("/webhook", upload.single("file"), async (req, res) => {
  try {
    const { fromEmail, subject } = req.body;
    const file = req.file;
    
    if (!fromEmail || !file) {
      return res.status(400).json({ error: "Missing fromEmail or attached Excel file" });
    }

    // 1. Compare sender domain with existing users
    const domain = fromEmail.split('@')[1];
    if (!domain) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const p = getPool();
    if (!p) return res.status(500).json({ error: "DB not connected" });

    // Find the tenant for this domain
    const tenantRes = await p.query(
      `SELECT id as tenant_id FROM tenants WHERE name = $1 LIMIT 1`,
      [domain]
    );

    if (tenantRes.rows.length === 0) {
      console.warn(`[Ingest Webhook] Rejected email from unknown domain: ${fromEmail}`);
      return res.status(200).json({ ignored: true, message: "Sender domain not recognized. Gracefully dropping without failing n8n." });
    }

    const tenantId = tenantRes.rows[0].tenant_id;
    console.log(`[Ingest Webhook] Processing Excel sheet from ${fromEmail} (Tenant: ${tenantId})`);

    // Parse the physical Excel file natively
    const lines = parseExcelBuffer(file.buffer);
    
    // Inject the lines straight into Postgres seamlessly
    const batchId = await processIngestedExcel(tenantId, file.originalname || "Unknown.xlsx", lines, fromEmail);
    
    return res.json({ 
        message: "File ingested and parsed successfully.",
        batchId,
        tenantId,
        processedLines: lines.length
    });

  } catch (err) {
    console.error("[Ingest Webhook Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
