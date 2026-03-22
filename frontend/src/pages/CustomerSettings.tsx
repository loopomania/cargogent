import { useEffect, useState } from "react";
import { fetchMeSettings, patchMeSettings, type MeNotificationSettings } from "../lib/api";

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.75rem",
  color: "var(--text-muted)",
  marginBottom: "0.35rem",
};
const selectStyle: React.CSSProperties = {
  padding: "0.6rem 0.75rem",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text)",
  minWidth: 220,
};

export default function CustomerSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<MeNotificationSettings>({
    incremental_email_interval_hours: 2,
    full_report_times_per_day: 1,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchMeSettings();
        if (!cancelled) setForm(s);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      const s = await patchMeSettings(form);
      setForm(s);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 style={{ marginBottom: "0.25rem" }}>Settings</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>
        Email notification preferences for your account (per PRD).
      </p>

      {loading && <p style={{ color: "var(--text-muted)" }}>Loading…</p>}
      {!loading && (
        <form onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={labelStyle}>Incremental update emails — check interval (hours)</label>
            <select
              style={selectStyle}
              value={form.incremental_email_interval_hours}
              onChange={(e) =>
                setForm((f) => ({ ...f, incremental_email_interval_hours: Number(e.target.value) }))
              }
            >
              {[1, 2, 3, 4].map((h) => (
                <option key={h} value={h}>
                  Every {h} hour{h > 1 ? "s" : ""}
                </option>
              ))}
            </select>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
              How often to email you when there are shipment changes since the last notification.
            </p>
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label style={labelStyle}>Full report emails per day</label>
            <select
              style={selectStyle}
              value={form.full_report_times_per_day}
              onChange={(e) =>
                setForm((f) => ({ ...f, full_report_times_per_day: Number(e.target.value) }))
              }
            >
              {[0, 1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "None" : n === 1 ? "Once per day" : `${n} times per day`}
                </option>
              ))}
            </select>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
              Canonical full Excel-style report with status columns (when implemented in workflows).
            </p>
          </div>

          {error && (
            <p style={{ color: "var(--error)", marginBottom: "1rem", fontSize: "0.9rem" }}>{error}</p>
          )}
          {saved && (
            <p style={{ color: "var(--accent)", marginBottom: "1rem", fontSize: "0.9rem" }}>Saved.</p>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "0.6rem 1.5rem",
              background: "var(--accent)",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </form>
      )}
    </div>
  );
}
