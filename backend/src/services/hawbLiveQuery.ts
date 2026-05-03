/** Strip airline AWB grouping dashes for comparisons (615-66487890 vs 61566487890). */
export function normalizeAirWaybillDigits(s: string): string {
  return s.replace(/-/g, "").trim();
}

/**
 * Pass to AWBTrackers as `hawb` only for real house rows — omit when `hawb` is MAWB-only (same digits).
 * Matches frontend `hawbQueryParamForLiveTrack` so `/api/track`, workers, and Excel matching stay consistent.
 */
export function hawbQueryParamForLiveTrack(mawbRaw: string, hawbRaw: string | null | undefined): string | undefined {
  const h = (hawbRaw ?? "").trim();
  if (!h) return undefined;
  if (normalizeAirWaybillDigits(h) === normalizeAirWaybillDigits(mawbRaw)) return undefined;
  return h;
}
