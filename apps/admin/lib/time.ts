// Timestamps travel as ISO-8601 UTC strings between backend and frontend.
// These helpers normalize display + admin input.

export function formatLocal(
  iso: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  },
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}

// Convert a browser `<input type="datetime-local">` value (local time, no TZ)
// into a UTC ISO string suitable for the backend.
export function localDatetimeInputToIsoUtc(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// Inverse: convert a UTC ISO string into the local value expected by
// `<input type="datetime-local">` (which has no TZ suffix).
export function isoUtcToLocalDatetimeInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function msUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Number.isFinite(ms) ? ms : null;
}
