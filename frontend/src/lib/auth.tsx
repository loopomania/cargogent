import React, { createContext, useContext, useState, useCallback } from "react";

/** API returns `user` for invited freight-forwarder accounts; we treat it like `customer` in routing. */
type Role = "admin" | "customer" | "user";

interface User {
  id: string;
  email: string;
  role: Role;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// HIGH-04: Only the user object (no JWT token) lives in localStorage.
// The JWT is stored exclusively in an HttpOnly cookie set by the server.
const STORAGE_KEY = "cargogent_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include", // ensures the HttpOnly cookie is received and stored
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Invalid username or password");
      const u = data.user as User;
      if (!u?.email || !u?.role) throw new Error("Invalid username or password");
      setUser(u);
      // Only the non-sensitive user profile is stored locally.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
      return u;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    // HIGH-04: Ask the server to clear the HttpOnly session cookie.
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
