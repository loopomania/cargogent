import { Link, useSearchParams } from "react-router-dom";

export default function InviteExpired() {
  const [searchParams] = useSearchParams();
  const isReset = searchParams.get("type") === "reset";

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>⏱</div>
        <h1 style={{ marginBottom: "0.5rem", fontSize: "1.5rem" }}>Link Expired</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
          {isReset
            ? "This password reset link has expired or has already been used."
            : "This invitation link has expired or has already been used."}
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: 1.6 }}>
          {isReset
            ? <>Return to <Link to="/login" style={linkStyle}>Sign in</Link> and click "Forgot password?" to request a new link.</>
            : "Please contact your administrator to resend the invitation."}
        </p>
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
  borderRadius: 12, padding: "2rem", width: "100%", maxWidth: 400, textAlign: "center",
};
const linkStyle: React.CSSProperties = {
  color: "var(--accent)", textDecoration: "none",
};
