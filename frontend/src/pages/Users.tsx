import { useState, useEffect } from "react";
import { User, listUsers, createUser, deleteUser, resetUserPassword, generateUserKey } from "../lib/api";

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  
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

  useEffect(() => {
    fetchUsers();
  }, []);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newUsername.trim()) return;
    
    try {
      await createUser(newUsername.trim());
      setNewUsername("");
      setIsCreating(false);
      await fetchUsers();
      alert("User created! An email with a setup link has been sent.");
    } catch (err: any) {
      alert(err.message || "Failed to create user");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Are you sure you want to delete this user?")) return;
    try {
      await deleteUser(id);
      await fetchUsers();
    } catch (err: any) {
      alert(err.message || "Failed to delete user");
    }
  }

  async function handleResetPassword(id: string) {
    if (!window.confirm("Send a password reset email to this user?")) return;
    try {
      await resetUserPassword(id);
      alert("Password reset email sent!");
    } catch (err: any) {
      alert(err.message || "Failed to reset password");
    }
  }

  async function handleGenerateKey(id: string) {
    if (!window.confirm("Generate a new access key? The old key will immediately become invalid. The new key will be emailed to the user.")) return;
    try {
      await generateUserKey(id);
      await fetchUsers();
      alert("New access key generated and emailed to the user!");
    } catch (err: any) {
      alert(err.message || "Failed to generate access key");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ marginBottom: "0.25rem" }}>User Management</h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>
            Create and manage admin users and their access keys.
          </p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          style={{
            padding: "0.6rem 1.5rem",
            background: "var(--accent)",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {isCreating ? "Cancel" : "Create User"}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreateUser} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", marginBottom: "2rem", display: "flex", gap: "1rem", alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>Email Address</label>
            <input
              type="email"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="user@example.com"
              required
              style={{
                width: "100%",
                padding: "0.6rem 0.75rem",
                background: "var(--background)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--text)",
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              padding: "0.6rem 1.5rem",
              background: "var(--accent)",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Send Invite
          </button>
        </form>
      )}

      {error && <p style={{ color: "var(--error)", marginBottom: "1rem" }}>{error}</p>}
      
      {loading ? (
        <p>Loading users...</p>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "1rem", borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>Username</th>
                <th style={{ textAlign: "left", padding: "1rem", borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>Role</th>
                <th style={{ textAlign: "left", padding: "1rem", borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>Access Key</th>
                <th style={{ textAlign: "right", padding: "1rem", borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td style={{ padding: "1rem", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ fontWeight: 600 }}>{user.username}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                      Created: {new Date(user.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td style={{ padding: "1rem", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ fontSize: "0.7rem", padding: "4px 8px", background: "var(--border)", borderRadius: 12, textTransform: "capitalize" }}>
                      {user.role}
                    </span>
                  </td>
                  <td style={{ padding: "1rem", borderBottom: "1px solid var(--border)" }}>
                    {user.has_access_key ? (
                      <span style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>****-****-****-XXXX</span>
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: "0.8rem" }}>None setup</span>
                    )}
                  </td>
                  <td style={{ padding: "1rem", borderBottom: "1px solid var(--border)", textAlign: "right", display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => handleResetPassword(user.id)}
                      style={{ padding: "0.4rem 0.8rem", fontSize: "0.75rem", background: "var(--background)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--text)" }}
                    >
                      Reset Password
                    </button>
                    <button
                      onClick={() => handleGenerateKey(user.id)}
                      style={{ padding: "0.4rem 0.8rem", fontSize: "0.75rem", background: "var(--background)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--text)" }}
                    >
                      Generate Key
                    </button>
                    <button
                      onClick={() => handleDelete(user.id)}
                      disabled={user.username === "alon@cargogent.com"} // Disable root deletion
                      style={{ padding: "0.4rem 0.8rem", fontSize: "0.75rem", background: "rgba(220, 38, 38, 0.1)", border: "1px solid rgba(220, 38, 38, 0.2)", borderRadius: 6, cursor: user.username === "alon@cargogent.com" ? "not-allowed" : "pointer", color: "rgba(220, 38, 38, 1)", opacity: user.username === "alon@cargogent.com" ? 0.5 : 1 }}
                    >
                      Delete
                    </button>
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
