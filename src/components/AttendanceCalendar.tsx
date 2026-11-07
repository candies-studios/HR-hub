import { clsx } from 'clsx';
import { dayOfWeek, formatTime, todayIST } from '../lib/dates';
import { DAY_KIND_LABEL, type DayKind, type DayResult } from '../lib/salary';

export const KIND_STYLE: Record<DayKind, string> = {
  present: 'bg-emerald-500 text-white',
  late_excused: 'bg-emerald-500 text-white ring-2 ring-inset ring-orange-400',
  half_day: 'bg-yellow-400 text-yellow-950',
  late_half_day: 'bg-orange-500 text-white',
  absent: 'bg-red-500 text-white',
  paid_leave: 'bg-sky-500 text-white',
  unpaid_leave: 'bg-sky-200 text-sky-900',
  holiday_paid: 'bg-slate-400 text-white',
  holiday_unpaid: 'bg-slate-300 text-slate-700',
  weekly_off_paid: 'bg-slate-100 text-slate-500',
  weekly_off_unpaid: 'bg-slate-100 text-slate-400',
  not_employed: 'bg-white text-slate-300',
  upcoming: 'bg-white text-slate-400',
};

export const LEGEND: { label: string; cls: string }[] = [
  { label: 'Present', cls: 'bg-emerald-500' },
  { label: 'Absent', cls: 'bg-red-500' },
  { label: 'Half Day', cls: 'bg-yellow-400' },
  { label: 'Approved Leave', cls: 'bg-sky-500' },
  { label: 'Holiday', cls: 'bg-slate-400' },
  { label: 'Late Arrival', cls: 'bg-orange-500' },
  { label: 'Weekly Off', cls: 'bg-slate-100 border border-slate-200' },
];

export function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
      {LEGEND.map((l) => (
        <span key={l.label} className="inline-flex items-center gap-1.5">
          <span className={clsx('h-3 w-3 rounded', l.cls)} /> {l.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded bg-emerald-500 ring-2 ring-inset ring-orange-400" /> Late – exception approved
      </span>
    </div>
  );
}

export function AttendanceCalendar({ days, onDayClick }: { days: DayResult[]; onDayClick?: (d: DayResult) => void }) {
  if (!days.length) return null;
  const lead = dayOfWeek(days[0].date);
  const today = todayIST();
  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-slate-500">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: lead }).map((_, i) => <div key={`l${i}`} />)}
        {days.map((d) => {
          const a = d.attendance;
          const title = [
            d.kind === 'upcoming' && d.planned ? `Planned: ${DAY_KIND_LABEL[d.planned]}` : DAY_KIND_LABEL[d.kind], d.note,
            a?.sign_in_at ? `In: ${formatTime(a.sign_in_at)}` : '', a?.sign_out_at ? `Out: ${formatTime(a.sign_out_at)}` : '',
          ].filter(Boolean).join(' · ');
          return (
            <button
              key={d.date}
              type="button"
              title={title}
              disabled={!onDayClick || d.kind === 'not_employed' || d.date > today}
              onClick={() => onDayClick?.(d)}
              className={clsx(
                'relative flex aspect-square min-h-[38px] flex-col items-center justify-center rounded-lg border border-slate-200/60 text-sm font-semibold transition sm:aspect-[4/3]',
                d.kind === 'upcoming' && d.planned ? clsx(KIND_STYLE[d.planned], 'opacity-50') : KIND_STYLE[d.kind],
                onDayClick && d.kind !== 'not_employed' && d.date <= today && 'hover:scale-[1.04] hover:shadow',
                d.date === today && 'outline outline-2 outline-offset-1 outline-brand-500',
              )}
            >
              {Number(d.date.slice(8))}
              {a?.sign_in_at && <span className="hidden text-[10px] font-normal opacity-90 sm:block">{formatTime(a.sign_in_at)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
