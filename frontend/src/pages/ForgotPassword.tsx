import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await forgotPassword(email.trim().toLowerCase());
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={{ marginBottom: "0.5rem", fontSize: "1.5rem" }}>Check your email</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>
            If <strong>{email}</strong> is registered, you'll receive a password reset link
            shortly. The link is valid for 24 hours.
          </p>
          <Link to="/login" style={linkStyle}>
            ← Back to Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={{ marginBottom: "0.25rem", fontSize: "1.5rem" }}>Forgot password?</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
          Enter your email and we'll send you a reset link.
        </p>

        {error && (
          <div style={errorBoxStyle}>{error}</div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={labelStyle}>Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email}
            style={{ ...btnStyle, opacity: loading || !email ? 0.7 : 1, cursor: loading || !email ? "not-allowed" : "pointer" }}
          >
            {loading ? "Sending…" : "Send Reset Link"}
          </button>
        </form>

        <Link to="/login" style={linkStyle}>
          ← Back to Sign in
        </Link>
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  minHeight: "100vh", padding: "1rem",
};
const cardStyle: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: 12, padding: "2rem", width: "100%", maxWidth: 400,
  display: "flex", flexDirection: "column", gap: "1rem",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "0.75rem",
  color: "var(--text-muted)", marginBottom: "0.5rem",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "0.75rem",
  background: "var(--background)", border: "1px solid var(--border)",
  borderRadius: 8, color: "var(--text)",
};
const btnStyle: React.CSSProperties = {
  padding: "0.75rem", background: "var(--accent)", color: "white",
  border: "none", borderRadius: 8, fontWeight: 600,
};
const linkStyle: React.CSSProperties = {
  fontSize: "0.85rem", color: "var(--text-muted)",
  textDecoration: "none", marginTop: "0.5rem",
};
const errorBoxStyle: React.CSSProperties = {
  color: "var(--error)", fontSize: "0.85rem",
  background: "rgba(220,38,38,0.1)", padding: "0.75rem", borderRadius: 8,
};
