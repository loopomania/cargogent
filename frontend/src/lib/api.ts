const API_BASE = "/api";

// HIGH-04: No longer reads a JWT from localStorage.
// The browser automatically sends the HttpOnly `cargogent_session` cookie
// on every request because we include credentials: "include".
function authHeaders(): HeadersInit {
  return { Accept: "application/json" };
}

// Common fetch options — credentials: "include" tells the browser to send cookies.
const withCreds: RequestInit = { credentials: "include" };

async function handleResponse(res: Response): Promise<Response> {
  if (res.status === 401) {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("cargogent_user");
    }
    if (typeof window !== "undefined") {
      window.location.href = "/login?timeout=1";
    }
    throw new Error("Session expired");
  }
  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new Error(errorBody?.error || await res.text().catch(() => `HTTP ${res.status}`));
  }
  return res;
}

export interface TrackingEvent {
  status_code?: string;
  status?: string;
  location?: string;
  date?: string;
  pieces?: string;
  actual_pieces?: string;
  weight?: string;
  remarks?: string;
  flight?: string;
  manifest?: string;
  departure_date?: string;
  arrival_date?: string;
  reception_date?: string;
  release_date?: string;
  customs?: string;
  extended_sm?: string;
  estimated_date?: string;
  source: string;
}

export interface TrackingResponse {
  airline: string;
  awb: string;
  origin?: string;
  destination?: string;
  status?: string;
  flight?: string;
  hawb?: string;
  events: TrackingEvent[];
  message: string;
  blocked: boolean;
  raw_meta?: Record<string, unknown>;
}

/** GET /api/track/:awb */
export async function trackByAwb(awb: string, hawb?: string): Promise<TrackingResponse> {
  const url = new URL(`${window.location.origin}${API_BASE}/track/${encodeURIComponent(awb)}`);
  if (hawb) url.searchParams.append("hawb", hawb);

  const res = await fetch(url.toString(), {
    ...withCreds,
    headers: authHeaders(),
  });
  await handleResponse(res);
  return res.json();
}

/** GET /api/track/:airline/:awb */
export async function trackByAirline(airline: string, awb: string, hawb?: string): Promise<TrackingResponse> {
  const url = new URL(`${window.location.origin}${API_BASE}/track/${encodeURIComponent(airline)}/${encodeURIComponent(awb)}`);
  if (hawb) url.searchParams.append("hawb", hawb);

  const res = await fetch(url.toString(), {
    ...withCreds,
    headers: authHeaders(),
  });
  await handleResponse(res);
  return res.json();
}

/** User Management APIs */
export interface User {
  id: string;
  username: string;
  name?: string;
  role: string;
  has_access_key: boolean;
  created_at: string;
}

export async function listUsers(): Promise<User[]> {
  const res = await fetch(`${API_BASE}/users`, { ...withCreds, headers: authHeaders() });
  await handleResponse(res);
  return res.json();
}

export async function createUser(username: string, name: string): Promise<User> {
  const res = await fetch(`${API_BASE}/users`, {
    method: "POST",
    ...withCreds,
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ username, name }),
  });
  await handleResponse(res);
  const data = await res.json();
  return data.user;
}

export async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/users/${id}`, { method: "DELETE", ...withCreds, headers: authHeaders() });
  await handleResponse(res);
}

export async function resetUserPassword(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/users/${id}/reset`, { method: "POST", ...withCreds, headers: authHeaders() });
  await handleResponse(res);
}

export async function generateUserKey(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/users/${id}/key`, { method: "POST", ...withCreds, headers: authHeaders() });
  await handleResponse(res);
}

export async function setupPassword(token: string, newPassword: string): Promise<{ flow_type: string | null }> {
  const res = await fetch(`${API_BASE}/auth/setup-password`, {
    method: "POST",
    ...withCreds,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, newPassword }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err: any = new Error(body.error || `HTTP ${res.status}`);
    err.expired = !!body.expired;
    throw err;
  }
  return res.json();
}

export async function forgotPassword(email: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: "POST",
    ...withCreds,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  await handleResponse(res);
}

export async function verifyToken(token: string): Promise<{ valid: boolean; reason?: string; flow_type?: string | null }> {
  const res = await fetch(`${API_BASE}/auth/verify-token?token=${encodeURIComponent(token)}`, withCreds);
  return res.json();
}

export interface QueryLog {
  id: string;
  awb: string;
  hawb?: string;
  airline_code?: string;
  status?: string;
  duration_ms?: number;
  created_at: string;
  user_name?: string;
}

export interface QueryLogsResponse {
  logs: QueryLog[];
  total: number;
  page: number;
  limit: number;
}

// MED-03: Default limit lowered to 50 to prevent large data dumps on every page load.
export async function fetchLogs(page = 1, limit = 50): Promise<QueryLogsResponse> {
  const url = `${API_BASE}/logs?page=${page}&limit=${limit}`;
  const res = await fetch(url, { ...withCreds, headers: authHeaders() });
  await handleResponse(res);
  return res.json();
}

/** Customer console — /api/me */
export interface MeNotificationSettings {
  incremental_email_interval_hours: number;
  full_report_times_per_day: number;
}

export async function fetchMeSettings(): Promise<MeNotificationSettings> {
  const res = await fetch(`${API_BASE}/me/settings`, { ...withCreds, headers: authHeaders() });
  await handleResponse(res);
  return res.json();
}

export async function patchMeSettings(body: MeNotificationSettings): Promise<MeNotificationSettings> {
  const res = await fetch(`${API_BASE}/me/settings`, {
    method: "PATCH",
    ...withCreds,
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await handleResponse(res);
  return res.json();
}

export interface AttentionAwb {
  awb_id: string;
  mawb: string;
  hawb: string | null;
  latest_status: string | null;
  updated_at: string;
  reasons: ("stale_24h" | "special_treatment")[];
}

export async function fetchAttentionAwbs(): Promise<AttentionAwb[]> {
  const res = await fetch(`${API_BASE}/me/awbs/attention`, { ...withCreds, headers: authHeaders() });
  await handleResponse(res);
  const data = await res.json();
  return data.awbs ?? [];
}
