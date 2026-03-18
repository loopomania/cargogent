import { useState, useEffect } from "react";
import { User, listUsers, createUser, deleteUser, resetUserPassword, generateUserKey } from "../lib/api";

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newName, setNewName] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  async function fetchUsers() {
    try {
      setLoading(true);
      const data = await listUsers();
      setUsers(data);
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchUsers(); }, []);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newUsername.trim() || !newName.trim()) return;
    try {
      await createUser(newUsername.trim(), newName.trim());
      setNewUsername("");
      setNewName("");
      setIsCreating(false);
      await fetchUsers();
      setSuccessMsg(`Invitation sent to ${newUsername.trim()}.`);
      setTimeout(() => setSuccessMsg(""), 5000);
    } catch (err: any) {
      setError(err.message || "Failed to create user");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Are you sure you want to delete this user?")) return;
    try {
      await deleteUser(id);
      await fetchUsers();
    } catch (err: any) {
      setError(err.message || "Failed to delete user");
    }
  }

  async function handleResetPassword(id: string) {
    if (!window.confirm("Send a password reset email to this user?")) return;
    try {
      await resetUserPassword(id);
      setSuccessMsg("Password reset email sent.");
      setTimeout(() => setSuccessMsg(""), 5000);
    } catch (err: any) {
      setError(err.message || "Failed to reset password");
    }
  }

  async function handleGenerateKey(id: string) {
    if (!window.confirm("Generate a new access key? The old key will immediately become invalid. The new key will be emailed to the user.")) return;
    try {
      await generateUserKey(id);
      await fetchUsers();
      setSuccessMsg("New access key generated and emailed.");
      setTimeout(() => setSuccessMsg(""), 5000);
    } catch (err: any) {
      setError(err.message || "Failed to generate access key");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ marginBottom: "0.25rem" }}>User Management</h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>
            Create and manage users and their access keys.
          </p>
        </div>
        <button
          onClick={() => { setIsCreating(!isCreating); setError(""); }}
          style={{ padding: "0.6rem 1.5rem", background: "var(--accent)", color: "white", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}
        >
          {isCreating ? "Cancel" : "Create User"}
        </button>
      </div>

      {successMsg && (
        <div style={{ background: "rgba(22, 163, 74, 0.1)", border: "1px solid rgba(22,163,74,0.2)", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1rem", color: "#16a34a", fontSize: "0.85rem" }}>
          ✅ {successMsg}
        </div>
      )}
      {error && <p style={{ color: "var(--error)", marginBottom: "1rem" }}>{error}</p>}

      {isCreating && (
        <form onSubmit={handleCreateUser} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", marginBottom: "2rem", display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={labelStyle}>Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Jane Smith"
              required
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={labelStyle}>Email Address</label>
            <input
              type="email"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="user@example.com"
              required
              style={inputStyle}
            />
          </div>
          <button type="submit" style={{ padding: "0.6rem 1.5rem", background: "var(--accent)", color: "white", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>
            Send Invite
          </button>
        </form>
      )}

      {loading ? (
        <p>Loading users…</p>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr>
                <th style={thStyle}>Name / Email</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Access Key</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td style={tdStyle}>
                    {user.name && <div style={{ fontWeight: 600 }}>{user.name}</div>}
                    <div style={{ color: user.name ? "var(--text-muted)" : undefined, fontSize: user.name ? "0.75rem" : undefined }}>{user.username}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                      Created: {new Date(user.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: "0.7rem", padding: "4px 8px", background: "var(--border)", borderRadius: 12, textTransform: "capitalize" }}>
                      {user.role}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {user.has_access_key
                      ? <span style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>****-****-****-XXXX</span>
                      : <span style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: "0.8rem" }}>None setup</span>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                      <button onClick={() => handleResetPassword(user.id)} style={actionBtnStyle}>Reset Password</button>
                      <button onClick={() => handleGenerateKey(user.id)} style={actionBtnStyle}>Generate Key</button>
                      <button
                        onClick={() => handleDelete(user.id)}
                        disabled={user.username === "alon@cargogent.com"}
                        style={{ ...actionBtnStyle, background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)", color: "rgba(220,38,38,1)", opacity: user.username === "alon@cargogent.com" ? 0.5 : 1, cursor: user.username === "alon@cargogent.com" ? "not-allowed" : "pointer" }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>No users found.</div>}
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.35rem" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "0.6rem 0.75rem", background: "var(--background)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "1rem", borderBottom: "1px solid var(--border)", color: "var(--text-muted)" };
const tdStyle: React.CSSProperties = { padding: "1rem", borderBottom: "1px solid var(--border)" };
const actionBtnStyle: React.CSSProperties = { padding: "0.4rem 0.8rem", fontSize: "0.75rem", background: "var(--background)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--text)" };
