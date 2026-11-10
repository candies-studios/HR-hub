/**
 * Date helpers. Every business date in the app is a plain 'YYYY-MM-DD'
 * string representing a calendar day in Indian Standard Time.
 */
export const IST = 'Asia/Kolkata';

const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' });

export const toISTDate = (d: Date | string): string => ymdFmt.format(typeof d === 'string' ? new Date(d) : d);
export const todayIST = (): string => toISTDate(new Date());

export const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export const parseYMD = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
};

/** month is 1-12; handles leap years */
export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export const monthStart = (year: number, month: number) => ymd(year, month, 1);
export const monthEnd = (year: number, month: number) => ymd(year, month, daysInMonth(year, month));

export const monthDates = (year: number, month: number): string[] =>
  Array.from({ length: daysInMonth(year, month) }, (_, i) => ymd(year, month, i + 1));

/** 0 = Sunday ... 6 = Saturday */
export const dayOfWeek = (s: string) => {
  const { y, m, d } = parseYMD(s);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

export const addDays = (s: string, n: number) => {
  const { y, m, d } = parseYMD(s);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
};

export const diffDays = (a: string, b: string) => {
  const pa = parseYMD(a);
  const pb = parseYMD(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
};

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const monthName = (m: number) => MONTHS[m - 1];
export const monthLabel = (y: number, m: number) => `${MONTHS[m - 1]} ${y}`;
export const shortMonthLabel = (y: number, m: number) => `${MONTHS[m - 1].slice(0, 3)} ${String(y).slice(2)}`;

export const formatDate = (s: string | null | undefined) => {
  if (!s) return '—';
  const { y, m, d } = parseYMD(s.slice(0, 10));
  return `${pad(d)} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
};

const timeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: true });
const dtFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
});
const hmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: false });

export const formatTime = (ts: string | null | undefined) => (ts ? timeFmt.format(new Date(ts)).toUpperCase() : '—');
export const formatDateTime = (ts: string | null | undefined) => (ts ? dtFmt.format(new Date(ts)) : '—');

/** timestamptz -> 'HH:MM' in IST (for <input type="time">) */
export const toISTTimeInput = (ts: string | null | undefined) => (ts ? hmFmt.format(new Date(ts)) : '');

/** IST date + 'HH:MM' -> ISO string with +05:30 offset */
export const istToISO = (date: string, time: string) => (time ? `${date}T${time.length === 5 ? time + ':00' : time}+05:30` : null);

/** '18:30:00' -> '6:30 PM' */
export const formatClock = (t: string | null | undefined) => {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
};

/** 'Office hours 9:30 AM – 6:30 PM IST' */
export const officeHours = (s: { reporting_time: string; office_end_time?: string } | null | undefined) =>
  `${formatClock(s?.reporting_time ?? '09:30')} – ${formatClock(s?.office_end_time ?? '18:30')} IST`;

export const minutesToHM = (mins: number | null | undefined) => {
  if (!mins || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${pad(m)}m`;
};

export const currentYearMonth = () => {
  const { y, m } = parseYMD(todayIST());
  return { year: y, month: m };
};

export const prevMonth = (year: number, month: number) => (month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 });
export const nextMonth = (year: number, month: number) => (month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 });

/** DOB 'YYYY-MM-DD' -> 'DDMMYYYY' */
export const dobToPassword = (dob: string) => {
  const { y, m, d } = parseYMD(dob);
  return `${pad(d)}${pad(m)}${y}`;
};

/** list of the last n months ending at (year, month), oldest first */
export const lastMonths = (year: number, month: number, n: number) => {
  const out: { year: number; month: number }[] = [];
  let cur = { year, month };
  for (let i = 0; i < n; i++) {
    out.unshift(cur);
    cur = prevMonth(cur.year, cur.month);
  }
  return out;
};
