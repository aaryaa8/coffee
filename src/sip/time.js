/* ---------- time zones ----------
   Every coffee belongs to the calendar day of the person drinking it, in the time zone
   they were in. Each entry stores that zone, and settings remember each person's
   current zone so "today" means their today, wherever the viewer is. */

export const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const fmtCache = new Map();
function fmt(tz, opts) {
  const key = tz + JSON.stringify(opts);
  if (!fmtCache.has(key)) {
    try { fmtCache.set(key, new Intl.DateTimeFormat("en-CA", { timeZone: tz, ...opts })); }
    catch { fmtCache.set(key, new Intl.DateTimeFormat("en-CA", opts)); }
  }
  return fmtCache.get(key);
}

/** YYYY-MM-DD for an instant, as seen in a time zone. */
export const dayKey = (ms, tz = deviceTz()) =>
  fmt(tz, { year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);

/** Moves a YYYY-MM-DD key by whole days. */
export function shiftDay(key, n) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const weekdayShort = (key) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString([], { weekday: "short", timeZone: "UTC" });

export const dateLabel = (key) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** "9:36 AM" in the given zone, using the viewer's clock style. */
export function fmtTime(ms, tz = deviceTz()) {
  try { return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: tz }); }
  catch { return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
}

/** "21:00" in the given zone, for spreadsheets. */
export function fmtTime24(ms, tz) {
  const parts = fmt(tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(ms);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

/** Short zone name such as "PDT" or "GMT+4". */
export function tzShort(tz, ms = Date.now()) {
  return fmt(tz, { timeZoneName: "short" }).formatToParts(ms).find((p) => p.type === "timeZoneName")?.value ?? tz;
}

/** How far a time zone is ahead of UTC at a given instant, in ms. */
function tzOffset(ms, tz) {
  const parts = fmt(tz, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(ms);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - Math.floor(ms / 1000) * 1000;
}

/** The instant a wall-clock date and time ("2026-10-21", "09:36") happened in a time zone. */
export function zonedTime(key, hhmm, tz) {
  const [y, m, d] = key.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  const first = wall - tzOffset(wall, tz);
  return wall - tzOffset(first, tz);
}
