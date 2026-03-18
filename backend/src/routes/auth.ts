import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { config } from "../config/index.js";
import { getUserByUsername, updateUserPassword, generateAccessKey } from "../services/userService.js";
import { sendMail } from "../services/mailService.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login requests per windowMs
  message: { error: "Too many login attempts, please try again after 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

/** POST /api/auth/login — validate email/password, return user + JWT for API auth. */
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
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const match = await bcrypt.compare(pwd, userRecord.password_hash);
  if (!match) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const user = { id: userRecord.id, email: userRecord.username, role: userRecord.role, tenant_id: userRecord.tenant_id };
  let token: string | undefined;
  if (config.jwtSecret) {
    token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id },
      config.jwtSecret,
      { expiresIn: "30m" } // Changed from 7d to 30m
    );
  }

  res.json({ user, token });
});

/** POST /api/auth/setup-password — Complete user creation or reset flow */
router.post("/setup-password", async (req, res) => {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };

  if (!token || !newPassword) {
    res.status(400).json({ error: "Token and new password required" });
    return;
  }

  // Validate Password Requirements
  // 8+ chars, 1 sign, 1 num, 1 lower, 1 upper
  const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  if (!passRegex.test(newPassword)) {
    res.status(400).json({ error: "Password must be at least 8 characters long, and contain at least one uppercase letter, one lowercase letter, one number, and one special character." });
    return;
  }

  if (!config.jwtSecret) {
    res.status(500).json({ error: "Server configuration error" });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { sub: string; username: string; action: string };
    
    // Update password
    await updateUserPassword(decoded.sub, newPassword);

    // If it was a setup action, we need to generate and send them their new API access key
    if (decoded.action === "setup") {
      const plainTextKey = await generateAccessKey(decoded.sub);
      
      await sendMail(
        decoded.username,
        "CargoGent - Your API Access Key",
        `<p>Your account has been successfully set up.</p>
         <p>Your API Access Key has been generated:</p>
         <p><strong>${plainTextKey}</strong></p>
         <p>Please keep this key secure. It will not be shown again.</p>`
      );
    }
    
    // Explicitly do not regenerate key if action is "reset"

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Invalid or expired token" });
  }
});

export default router;
