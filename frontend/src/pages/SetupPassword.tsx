import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { setupPassword, verifyToken } from "../lib/api";

interface Rule {
  label: string;
  test: (pw: string, confirm: string) => boolean;
}

const RULES: Rule[] = [
  { label: "At least 8 characters", test: (pw) => pw.length >= 8 },
  { label: "One uppercase letter (A–Z)", test: (pw) => /[A-Z]/.test(pw) },
  { label: "One lowercase letter (a–z)", test: (pw) => /[a-z]/.test(pw) },
  { label: "One number (0–9)", test: (pw) => /\d/.test(pw) },
  { label: "One special character (!@#$…)", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
  { label: "Passwords match", test: (pw, confirm) => pw.length > 0 && pw === confirm },
];

export default function SetupPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const navigate = useNavigate();

  const [flowType, setFlowType] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Verify token validity before showing the form
  useEffect(() => {
    if (!token) {
      navigate("/invite-expired");
      return;
    }
    verifyToken(token).then((result) => {
      if (!result.valid) {
        navigate("/invite-expired");
      } else {
        setFlowType(result.flow_type ?? null);
        setChecking(false);
      }
    });
  }, [token, navigate]);

  const allPassed = RULES.every((r) => r.test(password, confirm));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allPassed) return;
    setError("");
    setLoading(true);
    try {
      const res = await setupPassword(token, password);
      setFlowType(res.flow_type ?? flowType);
      setSuccess(true);
      setTimeout(() => navigate("/login"), 3500);
    } catch (err: any) {
      if (err.expired) {
        navigate("/invite-expired?type=" + (flowType === "reset" ? "reset" : ""));
      } else {
        setError(err.message || "Failed to set password. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div style={containerStyle}>
        <p style={{ color: "var(--text-muted)" }}>Verifying link…</p>
      </div>
    );
  }

  if (success) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>✅</div>
          <h2 style={{ marginBottom: "0.75rem" }}>Password set!</h2>
          {flowType === "invite" && (
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
              Your API Access Key has been generated and sent to your email.
            </p>
          )}
          <p style={{ color: "var(--accent)", fontSize: "0.8rem", fontWeight: 600 }}>
            Redirecting to sign in…
          </p>
        </div>
      </div>
    );
  }

  const isInvite = flowType === "invite";

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={{ marginBottom: "0.25rem", fontSize: "1.5rem" }}>
          {isInvite ? "Welcome — set your password" : "Reset your password"}
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
          {isInvite
            ? "Choose a secure password to complete your account setup."
            : "Enter a new secure password for your account."}
        </p>

        {error && <div style={errorBoxStyle}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={labelStyle}>New Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              placeholder="Enter password"
              style={inputStyle}
            />
            {/* Live guideline checklist */}
            <ul style={{ listStyle: "none", margin: "0.75rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {RULES.map((rule) => {
                const passed = rule.test(password, confirm);
                return (
                  <li key={rule.label} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", color: passed ? "var(--accent)" : "var(--text-muted)" }}>
                    <span style={{ fontSize: "0.9rem" }}>{passed ? "✅" : "⬜"}</span>
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <label style={labelStyle}>Confirm Password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={loading}
              placeholder="Re-enter password"
              style={{
                ...inputStyle,
                borderColor: confirm && !RULES[5].test(password, confirm) ? "var(--error)" : "var(--border)",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={!allPassed || loading}
            style={{ ...btnStyle, opacity: !allPassed || loading ? 0.6 : 1, cursor: !allPassed || loading ? "not-allowed" : "pointer" }}
          >
            {loading ? "Saving…" : "Save Password"}
          </button>
        </form>
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
  borderRadius: 12, padding: "2rem", width: "100%", maxWidth: 420,
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
const errorBoxStyle: React.CSSProperties = {
  color: "var(--error)", fontSize: "0.85rem",
  background: "rgba(220,38,38,0.1)", padding: "0.75rem", borderRadius: 8, marginBottom: "0.5rem",
};
