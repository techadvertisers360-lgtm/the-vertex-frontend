/**
 * Clinic time helpers. All display and input is in Asia/Karachi regardless of the browser's timezone.
 * Pakistan has no DST (fixed UTC+05:00), so clinic-local input converts with a fixed offset (D-025).
 */
export const CLINIC_TZ = process.env.NEXT_PUBLIC_APP_TIMEZONE || 'Asia/Karachi';
const OFFSET = '+05:00';

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: CLINIC_TZ, ...opts });
const dateFmt = fmt({ day: '2-digit', month: 'short', year: 'numeric' });
const timeFmt = fmt({ hour: 'numeric', minute: '2-digit', hour12: true });
const dayFmt = fmt({ weekday: 'short', day: '2-digit', month: 'short' });
const isoDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: CLINIC_TZ, hour: '2-digit', minute: '2-digit', hour12: false });

type D = string | Date | null | undefined;
const toDate = (d: D) => (d ? (d instanceof Date ? d : new Date(d)) : null);

export function formatDate(d: D): string {
  const x = toDate(d);
  return x ? dateFmt.format(x) : '—';
}
export function formatTime(d: D): string {
  const x = toDate(d);
  return x ? timeFmt.format(x).toLowerCase() : '—';
}
export function formatDateTime(d: D): string {
  const x = toDate(d);
  return x ? `${dateFmt.format(x)}, ${timeFmt.format(x).toLowerCase()}` : '—';
}
export function formatDay(d: D): string {
  const x = toDate(d);
  return x ? dayFmt.format(x) : '—';
}

/** Clinic-local 'YYYY-MM-DD' for an instant (default now). */
export function clinicDate(d: Date = new Date()): string {
  return isoDateFmt.format(d);
}
/** Clinic-local 'HH:mm'. */
export function clinicHm(d: D): string {
  const x = toDate(d);
  return x ? hmFmt.format(x) : '';
}
export function addDays(isoDate: string, days: number): string {
  const [y, m, dd] = isoDate.split('-').map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, dd! + days));
  return t.toISOString().slice(0, 10);
}
/** Clinic-local date + 'HH:mm' → UTC ISO string for the API. */
export function clinicToIso(isoDate: string, hhmm: string): string {
  return new Date(`${isoDate}T${hhmm}:00${OFFSET}`).toISOString();
}

export function relativeFromNow(d: D): string {
  const x = toDate(d);
  if (!x) return '—';
  const diffMin = Math.round((x.getTime() - Date.now()) / 60000);
  const abs = Math.abs(diffMin);
  const unit = abs < 60 ? `${abs} min` : abs < 1440 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} d`;
  if (abs < 1) return 'abhi';
  return diffMin > 0 ? `in ${unit}` : `${unit} ago`;
}
