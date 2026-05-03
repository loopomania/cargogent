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

/** Backend-computed milestone graph (canonical). See `backend/docs/MILESTONE_RULE_CONTRACT.md`. */
export type MilestoneProjectionStep =
  | { kind: "arrow"; done: boolean }
  | {
      kind: "node";
      code: string;
      label: string;
      desc: string;
      done: boolean;
      active: boolean;
      location?: string;
      status_code?: string;
      flight?: string;
      pieces?: string | null;
      weight?: string | null;
      date?: string;
      estimated_date?: string | null;
      departure_date?: string | null;
      arrival_date?: string | null;
      excelEtd?: string | null;
      excelEta?: string | null;
    };

export interface MilestoneProjection {
  milestone_projection_version: string;
  schedule_policy_version: string;
  interpretation_trace: string[];
  origin_display: string;
  dest_display: string;
  flows_steps: MilestoneProjectionStep[][];
  failed_route_summaries: { routeText: string; flightNo: string; plannedHint: string }[];
  meta: {
    paths_count: number;
    has_maman: boolean;
    has_swissport: boolean;
    is_dlv: boolean;
    is_err: boolean;
    overall_status: string;
    max_pieces: number;
    ground_handlers_label: string;
    ground_data_status?: "ok" | "no_data" | "na";
  };
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
  milestone_projection?: MilestoneProjection;
}

/** Compare MAWB vs schedule key ignoring airline dash grouping (605-12345678). */
function normalizeAirWaybillDigits(s: string): string {
  return s.replace(/-/g, "").trim();
}

/**
 * Use as `hawb` query param on live `/api/track` only when the row is not MAWB-only
 * (`hawb` equals MAWB digits). Fixes cases where raw `hawb !== mawb` is false despite
 * a real house bill (duplicate field values, formatting).
 */
export function hawbQueryParamForLiveTrack(mawb: string, hawb: string | null | undefined): string | undefined {
  const h = (hawb ?? "").trim();
  if (!h) return undefined;
  if (normalizeAirWaybillDigits(h) === normalizeAirWaybillDigits(mawb)) return undefined;
  return h;
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

export interface TrackedListItem {
  mawb: string;
  hawb: string;
  last_query_date: string | null;
  number_of_legs: string;
  number_of_pieces: string;
  origin: string;
  destination: string;
  eta: string | null;
  ata: string | null;
  status: string | null;
  tenant_id?: string;
  domain_name?: string;
}

export async function fetchTrackedList(): Promise<TrackedListItem[]> {
  const res = await fetch(`${API_BASE}/track/list`, { ...withCreds, headers: authHeaders() });
  await handleResponse(res);
  const data = await res.json();
  return data.awbs || [];
}

export interface ActiveQuery {
  customer: string | null;
  mawb: string;
  hawb: string;
  last_query_date: string | null;
  active_time_days: number | null;
}

export async function fetchActiveQueries(): Promise<ActiveQuery[]> {
  const res = await fetch(`${API_BASE}/track/active-queries`, { ...withCreds, headers: authHeaders() });
  await handleResponse(res);
  const data = await res.json();
  return data.active_queries || [];
}

export interface WorkerStatus {
  active: number;
  queued: number;
}

export async function fetchWorkerStatus(): Promise<WorkerStatus> {
  const res = await fetch(`${API_BASE}/track/worker-status`, { ...withCreds, headers: authHeaders() });
  await handleResponse(res);
  return res.json();
}

/** GET /api/track/stored/:mawb/:hawb — load persisted events from DB without a live query */
export async function fetchStoredTracking(mawb: string, hawb?: string): Promise<TrackingResponse> {
  const url = `${API_BASE}/track/stored/${encodeURIComponent(mawb)}/${encodeURIComponent(hawb || mawb.replace(/-/g, ""))}`;
  const res = await fetch(url, { ...withCreds, headers: authHeaders() });
  await handleResponse(res);
  return res.json();
}

/** DELETE /api/track/remove/:mawb/:hawb — remove a shipment from all tracking tables */
export async function removeTrackedAwb(mawb: string, hawb: string, tenantId?: string): Promise<void> {
  let url = `${API_BASE}/track/remove/${encodeURIComponent(mawb)}/${encodeURIComponent(hawb)}`;
  if (tenantId) url += `?tenant_id=${encodeURIComponent(tenantId)}`;
  const res = await fetch(url, { method: "DELETE", ...withCreds, headers: authHeaders() });
  await handleResponse(res);
}

/** POST /api/track/mark-delivered/:mawb/:hawb — Mark a shipment as delivered manually */
export async function markDeliveredTrackedAwb(mawb: string, hawb: string, tenantId?: string): Promise<void> {
  let url = `${API_BASE}/track/mark-delivered/${encodeURIComponent(mawb)}/${encodeURIComponent(hawb)}`;
  if (tenantId) url += `?tenant_id=${encodeURIComponent(tenantId)}`;
  const res = await fetch(url, { method: "POST", ...withCreds, headers: authHeaders() });
  await handleResponse(res);
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

export async function inviteUser(email: string, role: string, isCustomerConsole: boolean): Promise<void> {
  const url = `${API_BASE}/users/invite`;
  const res = await fetch(url, {
    method: "POST",
    ...withCreds,
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ email, role, isCustomerConsole }),
  });
  await handleResponse(res);
}

export interface BatchLog {
  id: string;
  ingested_at: string;
  sender_email: string | null;
  shipments_count: string;
}

export async function fetchIngestBatches(): Promise<{ batches: BatchLog[] }> {
  const res = await fetch(`${API_BASE}/logs/batches`, { ...withCreds, headers: authHeaders() });
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

export interface CustomerAwb {
  awb_id: string;
  mawb: string;
  hawb: string | null;
  status: string | null;
  eta: string | null;
  ata: string | null;
  last_update: string | null;
  reasons: string[];
}

export async function fetchAttentionAwbs(): Promise<CustomerAwb[]> {
  const res = await fetch(`${API_BASE}/me/awbs/attention`, { ...withCreds, headers: authHeaders() });
  await handleResponse(res);
  const data = await res.json();
  return data.awbs ?? [];
}

export async function fetchOpenAwbs(): Promise<CustomerAwb[]> {
  const res = await fetch(`${API_BASE}/me/awbs/open`, { ...withCreds, headers: authHeaders() });
  await handleResponse(res);
  const data = await res.json();
  return data.awbs ?? [];
}

export async function fetchArchivedAwbs(page = 1, limit = 100, search = ""): Promise<{ data: CustomerAwb[], total: number }> {
  const q = new URLSearchParams({ page: String(page), limit: String(limit), search });
  const res = await fetch(`${API_BASE}/me/awbs/archived?${q.toString()}`, { ...withCreds, headers: authHeaders() });
  await handleResponse(res);
  return res.json();
}

/** POST /api/track/mark-archived/:mawb/:hawb — Mark a shipment as archived manually */
export async function markArchivedTrackedAwb(mawb: string, hawb: string): Promise<void> {
  const url = `${API_BASE}/track/mark-archived/${encodeURIComponent(mawb)}/${encodeURIComponent(hawb)}`;
  const res = await fetch(url, { method: "POST", ...withCreds, headers: authHeaders() });
  await handleResponse(res);
}

/** Services Status */
export type ServiceStatus = "active" | "degraded" | "offline" | "suspended";

export interface ServiceHealth {
  id: string;
  name: string;
  description: string;
  status: ServiceStatus;
  latency_ms: number | null;
  detail: string | null;
  checked_at: string;
}

export async function fetchServicesStatus(): Promise<ServiceHealth[]> {
  const res = await fetch(`${API_BASE}/services/status`, { ...withCreds, headers: authHeaders() });
  await handleResponse(res);
  const data = await res.json();
  return data.services ?? [];
}

/** Circuit Breakers */
export interface CircuitBreakerEntry {
  airline: string;
  status: "closed" | "degraded" | "tripped";
  failures: number;
  max_failures: number;
  cooldown_seconds: number;
  cooldown_remaining_s: number | null;
  blocked_until: number | null;
}

export async function fetchCircuitBreakers(): Promise<CircuitBreakerEntry[]> {
  const res = await fetch(`${API_BASE}/services/circuit-breakers`, { ...withCreds, headers: authHeaders() });
  await handleResponse(res);
  const data = await res.json();
  return data.circuit_breakers ?? [];
}

/** AWB Tracking Queue Stats */
export interface AwbTrackingStats {
  total_active: number;
  halted: number;
  due_now: number;
  errors_3plus: number;
  by_airline: { prefix: string; count: number }[];
  checked_at: string;
}

export async function fetchAwbTrackingStats(): Promise<AwbTrackingStats> {
  const res = await fetch(`${API_BASE}/services/awb-tracking`, { ...withCreds, headers: authHeaders() });
  await handleResponse(res);
  return res.json();
}

/** AWB Trackers list */
export interface TrackerEntry {
  key: string;
  display: string;
  iata_codes: string[];
  awb_prefixes: string[];
  proxy: "none" | "standard" | "premium" | "unknown";
  cb_status: "closed" | "degraded" | "tripped";
  cb_failures: number;
  cb_max_failures: number;
  cooldown_remaining_s: number | null;
}

export async function fetchTrackers(): Promise<TrackerEntry[]> {
  const res = await fetch(`${API_BASE}/services/trackers`, { ...withCreds, headers: authHeaders() });
  await handleResponse(res);
  const data = await res.json();
  return data.trackers ?? [];
}
