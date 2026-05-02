/** Shared normalization for tracker/replay event timestamps (avoid circular imports with route bundles). */
export function normalizeEventDate(rawStr: string | null | undefined): string | null {
  const raw = (rawStr || "").trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d{3}Z)?)?/);
  if (isoMatch && raw.includes("Z")) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString();
  } else if (isoMatch) {
    const [, y, m, d, hh = "00", mi = "00", ss = "00"] = isoMatch;
    const parsed = new Date(`${y}-${m}-${d}T${hh}:${mi}:${ss}`);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const ddmmyy = raw.match(/^(\d{2})\/(\d{2})\/(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (ddmmyy) {
    const [, dd, mm, yy, hh = "00", mi = "00"] = ddmmyy;
    const parsed = new Date(`20${yy}-${mm}-${dd}T${hh}:${mi}:00`);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }

  // "28/04/2026 09:41" — Cathay / EU-style (DD/MM/YYYY)
  const ddmmyyyy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = ddmmyyyy;
    const parsed = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }

  // "01 MAY 2026 15:18" (El Al / many airline consoles)
  const ddmonYyyy = raw.match(
    /^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/i,
  );
  if (ddmonYyyy) {
    const months: Record<string, string> = {
      JAN: "01",
      FEB: "02",
      MAR: "03",
      APR: "04",
      MAY: "05",
      JUN: "06",
      JUL: "07",
      AUG: "08",
      SEP: "09",
      OCT: "10",
      NOV: "11",
      DEC: "12",
    };
    const m = months[ddmonYyyy[2].toUpperCase()] ?? "01";
    const hh = (ddmonYyyy[4] ?? "00").padStart(2, "0");
    const mi = (ddmonYyyy[5] ?? "00").padStart(2, "0");
    const ss = (ddmonYyyy[6] ?? "00").padStart(2, "0");
    const parsed = new Date(`${ddmonYyyy[3]}-${m}-${ddmonYyyy[1].padStart(2, "0")}T${hh}:${mi}:${ss}`);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }

  // "02 May 26 10:30" (Challenge / PAL-style two-digit year with time)
  const ddmonYy = raw.match(
    /^(\d{1,2})\s+([A-Z]{3})\s+(\d{2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/i,
  );
  if (ddmonYy) {
    const months: Record<string, string> = {
      JAN: "01",
      FEB: "02",
      MAR: "03",
      APR: "04",
      MAY: "05",
      JUN: "06",
      JUL: "07",
      AUG: "08",
      SEP: "09",
      OCT: "10",
      NOV: "11",
      DEC: "12",
    };
    const m = months[ddmonYy[2].toUpperCase()] ?? "01";
    const hh = (ddmonYy[4] ?? "00").padStart(2, "0");
    const mi = (ddmonYy[5] ?? "00").padStart(2, "0");
    const ss = (ddmonYy[6] ?? "00").padStart(2, "0");
    const parsed = new Date(`20${ddmonYy[3]}-${m}-${ddmonYy[1].padStart(2, "0")}T${hh}:${mi}:${ss}`);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const ddmon = raw.match(/^(\d{1,2})\s+([A-Z]{3})(?:\s+(\d{2}:\d{2}))?/i);
  if (ddmon) {
    const months: Record<string, string> = {
      JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
      JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
    };
    const m = months[ddmon[2].toUpperCase()] ?? "01";
    const time = ddmon[3] ?? "00:00";
    const year = new Date().getFullYear();
    const parsed = new Date(`${year}-${m}-${ddmon[1].padStart(2, "0")}T${time}:00`);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) return parsed.toISOString();

  return raw;
}
