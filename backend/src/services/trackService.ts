import { config } from "../config/index.js";

export interface TrackingResponse {
  airline: string;
  awb: string;
  origin?: string;
  destination?: string;
  status?: string;
  flight?: string;
  events: Array<Record<string, unknown>>;
  message: string;
  blocked: boolean;
  raw_meta?: Record<string, unknown>;
}

const BASE = config.awbTrackersUrl;

/**
 * Proxy to AWBTrackers: GET /track/{awb} (airline from AWB prefix).
 */
export async function trackByAwb(awb: string, hawb?: string): Promise<{ data: TrackingResponse; status: number }> {
  let url = `${BASE}/track/${encodeURIComponent(awb)}`;
  if (hawb) url += `?hawb=${encodeURIComponent(hawb)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  const data = (await res.json()) as TrackingResponse;
  return { data, status: res.status };
}

/**
 * Proxy to AWBTrackers: GET /track/{airline}/{awb}.
 */
export async function trackByAirline(
  airline: string,
  awb: string,
  hawb?: string
): Promise<{ data: TrackingResponse; status: number }> {
  let url = `${BASE}/track/${encodeURIComponent(airline)}/${encodeURIComponent(awb)}`;
  if (hawb) url += `?hawb=${encodeURIComponent(hawb)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  const data = (await res.json()) as TrackingResponse;
  return { data, status: res.status };
}
