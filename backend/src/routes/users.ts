import { Router } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { authOptional, requireAdmin } from "../middleware/auth.js";
import {
  listUsers,
  createUser,
  deleteUser,
  generateAccessKey,
  getUserById,
} from "../services/userService.js";
import { sendMail } from "../services/mailService.js";

const router = Router();

// Only Admins can manage users
router.use(authOptional, requireAdmin);

/** Build the styled HTML email body */
function buildEmailHtml(
  name: string,
  inviteUrl: string,
  flowType: "invite" | "reset"
): { subject: string; html: string } {
  const greeting = name ? `Hi ${name},` : "Hi there,";
  const isInvite = flowType === "invite";

  const subject = isInvite
    ? "Welcome to CargoGent – Set Up Your Account"
    : "CargoGent – Password Reset Request";

  const heading = isInvite ? "You've been invited 🎉" : "Reset your password 🔐";
  const bodyText = isInvite
    ? "An administrator has created a CargoGent account for you. Click the button below to set your password and get started."
    : "We received a request to reset your CargoGent password. Click the button below to choose a new password.";
  const buttonText = isInvite ? "Set Your Password →" : "Reset My Password →";
  const buttonGradient = isInvite
    ? "linear-gradient(135deg,#6366f1,#8b5cf6)"
    : "linear-gradient(135deg,#f59e0b,#ef4444)";
  const footerText = isInvite
    ? "If you didn't expect this invitation, you can safely ignore this email. This link will expire after 24 hours."
    : "If you did not request a password reset, you can safely ignore this email — your password will remain unchanged.";

  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#0f1117;color:#e2e8f0;border-radius:12px">
  <div style="text-align:center;margin-bottom:32px">
    <h1 style="font-size:28px;font-weight:700;color:#ffffff;margin:0">CargoGent</h1>
    <p style="color:#6b7280;font-size:13px;margin:4px 0 0">Cargo Intelligence Platform</p>
  </div>
  <h2 style="font-size:20px;font-weight:600;color:#ffffff;margin:0 0 12px">${heading}</h2>
  <p style="color:#cbd5e1;line-height:1.6;margin:0 0 8px">${greeting}</p>
  <p style="color:#cbd5e1;line-height:1.6;margin:0 0 24px">${bodyText} This link expires in <strong style="color:#fff">24 hours</strong>.</p>
  <div style="text-align:center;margin:32px 0">
    <a href="${inviteUrl}" style="display:inline-block;background:${buttonGradient};color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;letter-spacing:0.3px">${buttonText}</a>
  </div>
  <p style="color:#4b5563;font-size:12px;line-height:1.6;border-top:1px solid #1f2937;padding-top:16px;margin:0">${footerText}</p>
</div>`;

  return { subject, html };
}

/** Helper: fire n8n webhook or fall back to SMTP */
async function sendUserEmail(
  email: string,
  name: string,
  inviteUrl: string,
  flowType: "invite" | "reset"
) {
  const { subject, html } = buildEmailHtml(name, inviteUrl, flowType);

  if (config.n8nInviteWebhookUrl) {
    // Send pre-built HTML to n8n — no expression interpolation needed
    const res = await fetch(config.n8nInviteWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, subject, html_body: html, flow_type: flowType }),
    });
    if (!res.ok) throw new Error(`n8n webhook failed: ${res.status}`);
  } else {
    // SMTP fallback for local dev
    await sendMail(email, subject, html);
  }
}

/** GET /api/users — List all users */
router.get("/", async (_req, res) => {
  try {
    const users = await listUsers();
    const maskedUsers = users.map((u) => ({
      ...u,
      has_access_key: !!u.access_key_hash,
      access_key_hash: undefined,
    }));
    res.json(maskedUsers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list users" });
  }
});

/** POST /api/users — Create a user and send invite via n8n / SMTP */
router.post("/", async (req, res) => {
  const { username, name } = req.body as { username?: string; name?: string };
  if (!username) {
    res.status(400).json({ error: "Username (email) is required" });
    return;
  }

  try {
    const user = await createUser(username, name ?? "");

    // 24-hour invite token
    const token = jwt.sign(
      { sub: user.id, email: user.username, name: user.name ?? "", flow_type: "invite" },
      config.jwtSecret,
      { expiresIn: "24h" }
    );

    const inviteUrl = `${config.appUrl}/setup-password?token=${token}`;
    await sendUserEmail(user.username, user.name ?? "", inviteUrl, "invite");

    res.status(201).json({ message: "User created and invite sent", user: { id: user.id, username: user.username, name: user.name } });
  } catch (err: any) {
    console.error(err);
    if (err.code === "23505") {
      res.status(409).json({ error: "Username already exists" });
    } else {
      res.status(500).json({ error: "Failed to create user" });
    }
  }
});

/** POST /api/users/:id/reset — Trigger password reset email */
router.post("/:id/reset", async (req, res) => {
  const { id } = req.params;
  try {
    const user = await getUserById(id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const token = jwt.sign(
      { sub: user.id, email: user.username, name: user.name ?? "", flow_type: "reset" },
      config.jwtSecret,
      { expiresIn: "24h" }
    );
    const inviteUrl = `${config.appUrl}/setup-password?token=${token}`;
    await sendUserEmail(user.username, user.name ?? "", inviteUrl, "reset");

    res.json({ message: "Reset email sent" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

/** POST /api/users/:id/key — Generate new 16-char access key */
router.post("/:id/key", async (req, res) => {
  const { id } = req.params;
  try {
    const user = await getUserById(id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const plainTextKey = await generateAccessKey(id);
    await sendMail(
      user.username,
      "CargoGent – New API Access Key",
      `<p>Your new API Access Key has been generated.</p><p><strong>${plainTextKey}</strong></p><p>Please keep this key secure. It will not be shown again.</p>`
    );
    res.json({ message: "Access key generated and emailed to user" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate access key" });
  }
});

/** DELETE /api/users/:id — Remove a user */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await deleteUser(id);
    res.json({ message: "User deleted successfully" });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || "Failed to delete user" });
  }
});

export default router;
