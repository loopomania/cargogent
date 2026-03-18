const API_BASE = "/api";

function authHeaders(): HeadersInit {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("cargogent_token") : null;
  const h: HeadersInit = { Accept: "application/json" };
  if (token) (h as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  return h;
}

async function handleResponse(res: Response): Promise<Response> {
  if (res.status === 401) {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("cargogent_user");
      localStorage.removeItem("cargogent_token");
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
    headers: authHeaders(),
  });
  await handleResponse(res);
  return res.json();
}

/** User Management APIs */
export interface User {
  id: string;
  username: string;
  role: string;
  has_access_key: boolean;
  created_at: string;
}

export async function listUsers(): Promise<User[]> {
  const res = await fetch(`${API_BASE}/users`, { headers: authHeaders() });
  await handleResponse(res);
  return res.json();
}

export async function createUser(username: string): Promise<User> {
  const res = await fetch(`${API_BASE}/users`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  await handleResponse(res);
  const data = await res.json();
  return data.user;
}

export async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/users/${id}`, { method: "DELETE", headers: authHeaders() });
  await handleResponse(res);
}

export async function resetUserPassword(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/users/${id}/reset`, { method: "POST", headers: authHeaders() });
  await handleResponse(res);
}

export async function generateUserKey(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/users/${id}/key`, { method: "POST", headers: authHeaders() });
  await handleResponse(res);
}

export async function setupPassword(token: string, newPassword: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/setup-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, newPassword }),
  });
  await handleResponse(res);
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

export async function fetchLogs(page = 1, limit = 1000): Promise<QueryLogsResponse> {
  const url = `${API_BASE}/logs?page=${page}&limit=${limit}`;
  const res = await fetch(url, { headers: authHeaders() });
  await handleResponse(res);
  return res.json();
}
