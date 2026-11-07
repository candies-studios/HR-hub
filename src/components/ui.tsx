import { clsx } from 'clsx';
import { Loader2, X } from 'lucide-react';
import {
  forwardRef, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { initials } from '../lib/format';
import { MONTHS } from '../lib/dates';

// ---------------------------------------------------------------- Button
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
  ghost: 'text-slate-600 hover:bg-slate-100',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

// ---------------------------------------------------------------- Form controls
const control =
  'block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100 disabled:text-slate-500';
/** full width unless the caller passes its own width class */
const ctl = (className?: string, extra?: string) => clsx(control, !/(^|\s)(w-|flex-1)/.test(className ?? '') && 'w-full', extra, className);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...rest }, ref) => (
  <input ref={ref} className={ctl(className)} {...rest} />
));
Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...rest }, ref) => (
  <select ref={ref} className={ctl(className, 'pr-8')} {...rest}>
    {children}
  </select>
));
Select.displayName = 'Select';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...rest }, ref) => (
  <textarea ref={ref} rows={3} className={ctl(className)} {...rest} />
));
Textarea.displayName = 'Textarea';

export function Field({ label, required, error, hint, children, className }: {
  label: string; required?: boolean; error?: string | null; hint?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Checkbox({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// ---------------------------------------------------------------- Layout
export function Card({ title, actions, children, className, bodyClassName }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string;
}) {
  return (
    <section className={clsx('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          {typeof title === 'string' ? <h2 className="text-sm font-semibold text-slate-800">{title}</h2> : title}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon, tone = 'brand', hint, onClick }: {
  label: string; value: ReactNode; icon: ReactNode; tone?: 'brand' | 'green' | 'red' | 'amber' | 'blue' | 'orange' | 'violet' | 'slate'; hint?: ReactNode; onClick?: () => void;
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600', green: 'bg-emerald-50 text-emerald-600', red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600', blue: 'bg-sky-50 text-sky-600', orange: 'bg-orange-50 text-orange-600',
    violet: 'bg-violet-50 text-violet-600', slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div
      onClick={onClick}
      className={clsx('flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm', onClick && 'cursor-pointer transition hover:border-brand-300 hover:shadow')}
    >
      <div className={clsx('rounded-lg p-2.5', tones[tone])}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 truncate text-2xl font-semibold text-slate-900">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Feedback
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('h-5 w-5 animate-spin text-brand-600', className)} />;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
      <Spinner /> {label}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-400">{icon}</div>}
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Alert({ tone = 'info', children, className }: { tone?: 'info' | 'warn' | 'error' | 'success'; children: ReactNode; className?: string }) {
  const t = {
    info: 'border-sky-200 bg-sky-50 text-sky-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-800',
    error: 'border-red-200 bg-red-50 text-red-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  };
  return <div className={clsx('rounded-lg border px-4 py-3 text-sm', t[tone], className)}>{children}</div>;
}

const badgeTones = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  yellow: 'bg-yellow-50 text-yellow-800 ring-yellow-600/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  grey: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  orange: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  brand: 'bg-brand-50 text-brand-700 ring-brand-600/20',
};
export type BadgeTone = keyof typeof badgeTones;
export function Badge({ tone = 'grey', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', badgeTones[tone], className)}>
      {children}
    </span>
  );
}

export const leaveStatusTone = (s: string): BadgeTone =>
  s === 'approved' ? 'green' : s === 'rejected' ? 'red' : s === 'cancelled' ? 'grey' : 'yellow';

// ---------------------------------------------------------------- Modal
export function Modal({ open, onClose, title, children, footer, size = 'md' }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <div className={clsx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', w)} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Tabs
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={clsx(
            'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition',
            value === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Table
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className="min-w-full divide-y divide-slate-200 text-sm">{children}</table>
    </div>
  );
}
export const Th = ({ children, className, onClick }: { children?: ReactNode; className?: string; onClick?: () => void }) => (
  <th onClick={onClick} className={clsx('whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500', onClick && 'cursor-pointer select-none hover:text-slate-800', className)}>
    {children}
  </th>
);
export const Td = ({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) => (
  <td colSpan={colSpan} className={clsx('whitespace-nowrap px-3 py-2.5 text-slate-700', className)}>{children}</td>
);

// ---------------------------------------------------------------- Avatar
export function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  return url ? (
    <img src={url} alt={name} className="shrink-0 rounded-full object-cover ring-2 ring-white" style={{ width: size, height: size }} />
  ) : (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 ring-2 ring-white"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </div>
  );
}

// ---------------------------------------------------------------- Month picker
export function MonthPicker({ year, month, onChange, minYear = 2020 }: { year: number; month: number; onChange: (y: number, m: number) => void; minYear?: number }) {
  const maxYear = new Date().getFullYear() + 1;
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i);
  return (
    <div className="flex gap-2">
      <Select value={month} onChange={(e) => onChange(year, Number(e.target.value))} className="w-40">
        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </Select>
      <Select value={year} onChange={(e) => onChange(Number(e.target.value), month)} className="w-24">
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </Select>
    </div>
  );
}
