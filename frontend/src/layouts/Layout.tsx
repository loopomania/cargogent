import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

const sidebarStyle: React.CSSProperties = {
  width: 220,
  minHeight: "100vh",
  background: "var(--surface)",
  borderRight: "1px solid var(--border)",
  padding: "1rem 0",
};

const navItemStyle: React.CSSProperties = {
  display: "block",
  padding: "0.6rem 1.25rem",
  color: "var(--text)",
  textDecoration: "none",
  borderLeft: "3px solid transparent",
};

export default function Layout({
  children,
  role,
}: {
  children: React.ReactNode;
  role: "admin" | "customer";
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div style={{ display: "flex" }}>
      <aside style={sidebarStyle}>
        <div style={{ padding: "0 1.25rem 1rem", fontWeight: 700 }}>CargoGent</div>
        <nav>
          {role === "admin" && (
            <>
              <Link to="/admin" style={navItemStyle}>
                AWB Query
              </Link>
              <Link to="/admin/users" style={navItemStyle}>
                User Management
              </Link>
              <Link to="/admin/logs" style={navItemStyle}>
                Query Logs
              </Link>
            </>
          )}
          {role === "customer" && (
            <Link to="/customer" style={navItemStyle}>
              My cargo
            </Link>
          )}
        </nav>
        <div style={{ marginTop: "auto", padding: "1rem 1.25rem", borderTop: "1px solid var(--border)" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{user?.email}</span>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              display: "block",
              marginTop: "0.5rem",
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: "2rem", maxWidth: 960 }}>
        {children}
      </main>
    </div>
  );
}
