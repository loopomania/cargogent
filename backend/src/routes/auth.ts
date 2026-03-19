import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { config } from "../config/index.js";
import {
  getUserByUsername,
  getUserById,
  updateUserPassword,
  generateAccessKey,
} from "../services/userService.js";
import { sendMail } from "../services/mailService.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts, please try again after 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// HIGH-03: Rate-limit the setup-password endpoint.
const setupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many attempts, please try again after 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

const verifyTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many requests" },
  standardHeaders: true,
  legacyHeaders: false,
});

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

/** Cookie options — HttpOnly so JS cannot read it (HIGH-04). */
const COOKIE_NAME = "cargogent_session";
// secure:true only when the site is actually served over HTTPS.
// Keying off APP_URL (not NODE_ENV) because prod may run on HTTP behind a future reverse proxy.
const isHttps = config.appUrl.startsWith("https://");
const cookieOpts = {
  httpOnly: true,
  secure: isHttps,
  sameSite: "strict" as const,
  maxAge: 30 * 60 * 1000, // 30 minutes, matching JWT expiry
  path: "/",
};

/** POST /api/auth/login */
router.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  const raw = (email ?? "").toString().trim().toLowerCase();
  const pwd = (password ?? "").toString();

  if (!raw || !pwd) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  const userRecord = await getUserByUsername(raw);
  if (!userRecord) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const match = await bcrypt.compare(pwd, userRecord.password_hash);
  if (!match) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const user = {
    id: userRecord.id,
    email: userRecord.username,
    name: userRecord.name,
    role: userRecord.role,
    tenant_id: userRecord.tenant_id,
  };

  if (config.jwtSecret) {
    const token = jwt.sign(
      { sub: user.id, email: user.email, name: user.name, role: user.role, tenant_id: user.tenant_id },
      config.jwtSecret,
      { expiresIn: "30m" }
    );
    // HIGH-04: set HttpOnly cookie — browser clients use this automatically.
    res.cookie(COOKIE_NAME, token, cookieOpts);
    // Still return the token in the body for API clients / backward-compat.
    res.json({ user, token });
  } else {
    res.json({ user });
  }
});

/** POST /api/auth/logout — clears the session cookie (HIGH-04). */
router.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ message: "Logged out" });
});

/** GET /api/auth/verify-token?token=... — Check a setup/invite/reset token without side-effects.
 *  Rate-limited. Does NOT reveal why a token is invalid (no oracle). */
router.get("/verify-token", verifyTokenLimiter, (req, res) => {
  const token = req.query.token as string | undefined;
  if (!token) {
    res.status(200).json({ valid: false });
    return;
  }
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as {
      flow_type?: string;
    };
    // Only reveal flow_type when valid — no reason on failure
    res.json({ valid: true, flow_type: decoded.flow_type ?? null });
  } catch {
    res.status(200).json({ valid: false });
  }
});

/** POST /api/auth/forgot-password — Send a password-reset email (rate-limited, no enumeration) */
router.post("/forgot-password", forgotLimiter, async (req, res) => {
  const { email } = req.body as { email?: string };
  const raw = (email ?? "").toString().trim().toLowerCase();

  // Always return 200 to avoid email enumeration
  res.json({ message: "If this email is registered, you will receive a reset link shortly." });

  if (!raw) return;

  try {
    const userRecord = await getUserByUsername(raw);
    if (!userRecord) return; // silently ignore

    const token = jwt.sign(
      { sub: userRecord.id, email: userRecord.username, name: userRecord.name ?? "", flow_type: "reset" },
      config.jwtSecret,
      { expiresIn: "24h" }
    );

    // HIGH-02: Use APP_URL env var — never derive from request Host header.
    const inviteUrl = `${config.appUrl}/setup-password?token=${token}`;
    await sendUserEmail(userRecord.username, userRecord.name ?? "", inviteUrl, "reset");
  } catch (err) {
    console.error("forgot-password error:", err);
  }
});

/** POST /api/auth/setup-password — Set password from invite or reset token */
// HIGH-03: rate-limited via setupLimiter.
router.post("/setup-password", setupLimiter, async (req, res) => {
  const { token, newPassword } = req.body as {
    token?: string;
    newPassword?: string;
  };

  if (!token || !newPassword) {
    res.status(400).json({ error: "Token and new password required" });
    return;
  }

  const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  if (!passRegex.test(newPassword)) {
    res
      .status(400)
      .json({
        error:
          "Password must be at least 8 characters and contain uppercase, lowercase, number, and special character.",
      });
    return;
  }

  if (!config.jwtSecret) {
    res.status(500).json({ error: "Server configuration error" });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as {
      sub: string;
      email: string;
      name?: string;
      flow_type?: string;
    };

    await updateUserPassword(decoded.sub, newPassword);

    // If this was an invitation (new user), auto-generate and email an API access key
    if (decoded.flow_type === "invite") {
      try {
        const plainTextKey = await generateAccessKey(decoded.sub);
        await sendMail(
          decoded.email,
          "CargoGent – Your API Access Key",
          `<p>Your account is all set up!</p><p>Your API Access Key:</p><p><strong>${plainTextKey}</strong></p><p>Keep this secure — it will not be shown again.</p>`
        );
      } catch (keyErr) {
        console.error("Failed to generate access key after invite setup:", keyErr);
      }
    }

    res.json({ message: "Password updated successfully", flow_type: decoded.flow_type ?? null });
  } catch (err: any) {
    console.error(err);
    if (err?.name === "TokenExpiredError") {
      res.status(400).json({ error: "This link has expired.", expired: true });
    } else {
      res.status(400).json({ error: "Invalid or expired token" });
    }
  }
});

export default router;
