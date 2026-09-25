// Formatting timestamps in the viewer's timezone. The browser sends its IANA timezone (e.g.
// "America/Chicago") in the X-Timezone header; the server formats dates with it.

export const TIMEZONE_HEADER = 'X-Timezone';

export const browserTimeZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

// Returns a usable IANA timezone, falling back to UTC for missing or invalid values
export function resolveTimeZone(tz: unknown): string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

// YYYY-MM-DD in the given timezone (sortable and comparable with date filters)
export function formatDateInZone(date: Date | string | null | undefined, tz: string): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
}

// e.g. "Oct 4, 2026, 2:30 PM" in the given timezone
export function formatDateTimeInZone(date: Date | string | null | undefined, tz: string): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' });
}

// e.g. "October 31, 2026" in the given timezone
export function formatLongDateInZone(date: Date | string | null | undefined, tz: string): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { timeZone: tz, year: 'numeric', month: 'long', day: 'numeric' });
}
