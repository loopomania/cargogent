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

/** Helper: fire n8n webhook or fall back to SMTP */
async function sendUserEmail(
  email: string,
  name: string,
  inviteUrl: string,
  flowType: "invite" | "reset"
) {
  if (config.n8nInviteWebhookUrl) {
    const res = await fetch(config.n8nInviteWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, inviteUrl, flow_type: flowType }),
    });
    if (!res.ok) throw new Error(`n8n webhook failed: ${res.status}`);
  } else {
    // SMTP fallback for local dev
    const subject =
      flowType === "invite"
        ? "Welcome to CargoGent – Set Up Your Account"
        : "CargoGent – Password Reset";
    const greeting = name ? `Hi ${name},` : "Hi,";
    const body =
      flowType === "invite"
        ? `<p>${greeting}</p><p>You've been invited to CargoGent. Click below to set your password (link valid 24 hours):</p><p><a href="${inviteUrl}">${inviteUrl}</a></p>`
        : `<p>${greeting}</p><p>Click below to reset your CargoGent password (link valid 24 hours):</p><p><a href="${inviteUrl}">${inviteUrl}</a></p><p>If you did not request this, ignore this email.</p>`;
    await sendMail(email, subject, body);
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
