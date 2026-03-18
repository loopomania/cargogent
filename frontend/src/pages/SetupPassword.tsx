import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { setupPassword } from "../lib/api";

export default function SetupPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Invalid or missing setup token. Please check your email link.");
    }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    setError("");
    setLoading(true);

    try {
      await setupPassword(token, password);
      setSuccess(true);
      setTimeout(() => navigate("/login"), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to setup password");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "1rem" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "2rem", width: "100%", maxWidth: 400, textAlign: "center" }}>
          <h2 style={{ marginBottom: "1rem" }}>Success!</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Your password has been securely updated. If this was your first time setting up, check your email for your new API Access Key.
          </p>
          <p style={{ color: "var(--accent)", marginTop: "1rem", fontSize: "0.8rem", fontWeight: "bold" }}>
            Redirecting to login...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "1rem" }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "2rem", width: "100%", maxWidth: 400 }}>
        <h1 style={{ marginBottom: "0.5rem", fontSize: "1.5rem" }}>Setup Password</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
          Please enter your new secure password.
        </p>
        {error && <div style={{ color: "var(--error)", marginBottom: "1rem", fontSize: "0.85rem", background: "rgba(220, 38, 38, 0.1)", padding: "0.75rem", borderRadius: 8 }}>{error}</div>}
        
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>New Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!token || loading}
              style={{
                width: "100%",
                padding: "0.75rem",
                background: "var(--background)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--text)",
              }}
            />
            <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.5rem", opacity: 0.8 }}>
              Requires at least 8 characters, one uppercase, one lowercase, one number, and one special character.
            </p>
          </div>
          
          <button
            type="submit"
            disabled={!token || loading || !password}
            style={{
              padding: "0.75rem",
              background: "var(--accent)",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: loading || !token || !password ? "not-allowed" : "pointer",
              opacity: loading || !token || !password ? 0.7 : 1,
              marginTop: "0.5rem",
            }}
          >
            {loading ? "Saving..." : "Save Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
