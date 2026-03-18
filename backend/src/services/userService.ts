import { getPool } from "./db.js";
import bcrypt from "bcrypt";
import crypto from "crypto";

export interface User {
  id: string;
  username: string;
  role: string;
  tenant_id?: string;
  access_key_hash?: string;
  created_at: Date;
}

function generateRandomKey(length: number = 16): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return result;
}

export async function listUsers(): Promise<User[]> {
  const pool = getPool();
  if (!pool) return [];
  const res = await pool.query(`
    SELECT id, username, role, tenant_id, access_key_hash, created_at
    FROM users
    ORDER BY created_at DESC
  `);
  return res.rows;
}

export async function getUserById(id: string): Promise<User | null> {
  const pool = getPool();
  if (!pool) return null;
  const res = await pool.query(
    "SELECT id, username, role, tenant_id, access_key_hash, created_at FROM users WHERE id = $1",
    [id]
  );
  return res.rows[0] || null;
}

export async function getUserByUsername(username: string): Promise<User & { password_hash: string } | null> {
  const pool = getPool();
  if (!pool) return null;
  const res = await pool.query(
    "SELECT id, username, password_hash, role, tenant_id, access_key_hash, created_at FROM users WHERE username = $1",
    [username]
  );
  return res.rows[0] || null;
}

export async function createUser(username: string, tenantId: string = '00000000-0000-0000-0000-000000000000'): Promise<User> {
  const pool = getPool();
  if (!pool) throw new Error("Database not connected");
  
  // Set an impossible password initially, they will set it via magic link
  const placeholderHash = await bcrypt.hash(crypto.randomUUID(), 10);
  
  const res = await pool.query(
    `INSERT INTO users (username, password_hash, role, tenant_id)
     VALUES ($1, $2, 'user', $3)
     RETURNING id, username, role, tenant_id, access_key_hash, created_at`,
    [username, placeholderHash, tenantId]
  );
  return res.rows[0];
}

export async function deleteUser(id: string): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("Database not connected");
  // Don't allow deleting the superadmin as a safeguard
  const res = await pool.query("DELETE FROM users WHERE id = $1 AND username != 'alon@cargogent.com'", [id]);
  if (res.rowCount === 0) {
    throw new Error("User not found or cannot delete super admin");
  }
}

export async function updateUserPassword(id: string, newPasswordPlain: string): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("Database not connected");
  
  const hash = await bcrypt.hash(newPasswordPlain, 10);
  await pool.query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [hash, id]);
}

export async function generateAccessKey(id: string): Promise<string> {
  const pool = getPool();
  if (!pool) throw new Error("Database not connected");

  const newKey = generateRandomKey(16);
  const hash = await bcrypt.hash(newKey, 10);
  
  await pool.query("UPDATE users SET access_key_hash = $1, updated_at = now() WHERE id = $2", [hash, id]);
  return newKey;
}
