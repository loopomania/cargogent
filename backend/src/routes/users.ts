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

/** GET /api/users — List all users */
router.get("/", async (req, res) => {
  try {
    const users = await listUsers();
    // Mask access key hash to only show availability
    const maskedUsers = users.map(u => ({
      ...u,
      has_access_key: !!u.access_key_hash,
      access_key_hash: undefined // Remove hash from response
    }));
    res.json(maskedUsers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list users" });
  }
});

/** POST /api/users — Create a user and email magic link */
router.post("/", async (req, res) => {
  const { username } = req.body;
  if (!username) {
    res.status(400).json({ error: "Username (email) is required" });
    return;
  }

  try {
    const user = await createUser(username);
    
    // Generate magic link token valid for 1 hour
    const token = jwt.sign(
      { sub: user.id, username: user.username, action: "setup" },
      config.jwtSecret,
      { expiresIn: "1h" }
    );
    
    // Note: Assuming frontend domain is the same or passed via env in a real scenario
    // For now returning the link, in reality we just email it
    const magicLink = `http://${req.headers.host}/setup-password?token=${token}`;
    
    await sendMail(
      user.username,
      "Welcome to CargoGent - Setup your password",
      `<p>You have been invited to CargoGent. Please set up your password and access key by clicking the link below (valid for 1 hour):</p>
       <a href="${magicLink}">${magicLink}</a>`
    );

    res.status(201).json({ message: "User created and email sent", user: { id: user.id, username: user.username } });
  } catch (err: any) {
    console.error(err);
    if (err.code === '23505') {
      res.status(409).json({ error: "Username already exists" });
    } else {
      res.status(500).json({ error: "Failed to create user" });
    }
  }
});

/** POST /api/users/:id/reset — Trigger password reset */
router.post("/:id/reset", async (req, res) => {
  const { id } = req.params;
  
  try {
    const user = await getUserById(id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const token = jwt.sign(
      { sub: user.id, username: user.username, action: "reset" },
      config.jwtSecret,
      { expiresIn: "1h" }
    );
    
    const magicLink = `http://${req.headers.host}/setup-password?token=${token}`;
    
    await sendMail(
      user.username,
      "CargoGent Password Reset",
      `<p>You requested a password reset. Click the link below to change your password (valid for 1 hour):</p>
       <a href="${magicLink}">${magicLink}</a>
       <p>If you did not request this, please ignore this email.</p>`
    );
    
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
      "CargoGent - New API Access Key",
      `<p>Your new API Access Key has been generated.</p>
       <p><strong>${plainTextKey}</strong></p>
       <p>Please keep this key secure. It will not be shown again.</p>`
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
