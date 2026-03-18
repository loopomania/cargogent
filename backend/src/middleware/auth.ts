import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config, isDev } from "../config/index.js";

type UserPayload = { sub?: string; email?: string; role?: string; tenant_id?: string };

/**
 * Set req.user from JWT (Bearer token) or in dev allow unauthenticated as admin.
 */
export function authOptional(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (config.jwtSecret) {
      try {
        const decoded = jwt.verify(token, config.jwtSecret) as UserPayload;
        (req as Request & { user?: UserPayload }).user = decoded;
      } catch {
        // invalid or expired token — leave req.user unset
      }
    } else if (isDev) {
      (req as Request & { user?: UserPayload }).user = { sub: "dev", role: "admin" };
    }
  } else if (isDev) {
    (req as Request & { user?: UserPayload }).user = { sub: "dev", role: "admin" };
  }
  next();
}

/** Require admin role. After full auth, check req.user.role === 'admin'. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as Request & { user?: { role?: string } }).user;
  
  // If no user object, or if it's a legacy token without a role
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
