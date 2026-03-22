import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";

type UserPayload = { sub?: string; email?: string; role?: string; tenant_id?: string };

/**
 * Set req.user from a verified JWT.
 * Priority order:
 *   1. Bearer token in Authorization header (API clients / legacy)
 *   2. HttpOnly cookie `cargogent_session` (browser clients)
 *
 * CRIT-03: Dev-mode auth bypass removed. All environments require a real JWT.
 */
export function authOptional(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let rawToken: string | undefined;

  if (authHeader?.startsWith("Bearer ")) {
    rawToken = authHeader.slice(7);
  } else {
    // Fall back to session cookie (HIGH-04)
    rawToken = (req as any).cookies?.cargogent_session as string | undefined;
  }

  if (rawToken && config.jwtSecret) {
    try {
      const decoded = jwt.verify(rawToken, config.jwtSecret) as UserPayload;
      (req as Request & { user?: UserPayload }).user = decoded;
    } catch {
      // invalid or expired token — leave req.user unset
    }
  }

  next();
}

/** Require admin role. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as Request & { user?: { role?: string } }).user;

  if (!user || !user.role) {
    res.status(401).json({ error: "Session expired" });
    return;
  }

  if (user.role === "admin") {
    next();
    return;
  }

  res.status(403).json({ error: "Admin required" });
}

/** Any authenticated user (admin or customer). */
export function requireAuthenticated(req: Request, res: Response, next: NextFunction): void {
  const user = (req as Request & { user?: { sub?: string } }).user;
  if (!user?.sub) {
    res.status(401).json({ error: "Session expired" });
    return;
  }
  next();
}

/**
 * Freight-forwarder console: role `user` (DB default for invited users) or `customer`.
 * Admins use /admin, not this API.
 */
export function requireCustomerRole(req: Request, res: Response, next: NextFunction): void {
  const user = (req as Request & { user?: { sub?: string; role?: string } }).user;
  if (!user?.sub) {
    res.status(401).json({ error: "Session expired" });
    return;
  }
  const r = user.role ?? "";
  if (r === "admin") {
    res.status(403).json({ error: "Use the admin console for this account" });
    return;
  }
  if (r !== "user" && r !== "customer") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}
