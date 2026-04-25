// Format ISO string -> "Mon, Feb 17 · 10:00 AM"
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// Build local datetime string for input default: "YYYY-MM-DDTHH:MM"
export function nowLocalForInput(addMinutes = 0): string {
  const d = new Date(Date.now() + addMinutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Build "HH:MM" string for time-only input (default = now + addMinutes, local)
export function nowLocalTime(addMinutes = 0): string {
  const d = new Date(Date.now() + addMinutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Combine "HH:MM" (local) with today's date -> ISO UTC string. Returns null if invalid.
export function todayTimeToISO(hhmm: string): string | null {
  if (!hhmm) return null;
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  const now = new Date();
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mi, 0, 0);
  return local.toISOString();
}

// Parse "YYYY-MM-DDTHH:MM" (local) -> ISO UTC string
export function localInputToISO(value: string): string | null {
  if (!value) return null;
  // Normalize: support "YYYY-MM-DD HH:MM" too
  const v = value.trim().replace(" ", "T");
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const local = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  if (isNaN(local.getTime())) return null;
  return local.toISOString();
}
