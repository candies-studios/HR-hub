import { CheckCheck, ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { KIND_STYLE, Legend } from '../../components/AttendanceCalendar';
import { AttendanceEditModal, type AttendanceTarget } from '../../components/AttendanceEditModal';
import { MonthAttendance } from '../../components/MonthAttendance';
import { useToast } from '../../components/Toast';
import {
  Alert, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Loading, Modal, MonthPicker, PageHeader, Select, Table, Tabs, Td, Textarea, Th,
} from '../../components/ui';
import { computeAll, computePayroll, employedInMonth, fetchEmployees, loadMonthData, loadRangeData, withMonth } from '../../lib/api';
import {
  addDays, currentYearMonth, dayOfWeek, formatDate, formatDateTime, formatTime, minutesToHM, MONTHS, parseYMD, todayIST, WEEKDAYS,
} from '../../lib/dates';
import { downloadCSV } from '../../lib/export';
import { days as fmtDays } from '../../lib/format';
import { useData } from '../../lib/hooks';
import { DAY_KIND_LABEL, effectiveKind, type DayKind, type DayResult } from '../../lib/salary';
import { errMsg, must, supabase } from '../../lib/supabase';
import type { AttendanceHistory, Employee } from '../../lib/types';

type Tab = 'daily' | 'monthly' | 'employee' | 'yearly' | 'history';

const kindTone = (k: DayKind) =>
  k === 'present' || k === 'late_excused' ? 'green' as const
  : k === 'absent' ? 'red' as const
  : k === 'half_day' ? 'yellow' as const
  : k === 'late_half_day' ? 'orange' as const
  : k === 'paid_leave' || k === 'unpaid_leave' ? 'blue' as const : 'grey' as const;

export default function AttendancePage() {
  const [tab, setTab] = useState<Tab>('daily');
  return (
    <>
      <PageHeader title="Attendance" subtitle="Sign-ins are captured automatically from the employee portal. Reporting time 10:00 AM IST; later sign-ins become half days unless an exception is approved." />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { value: 'daily', label: 'By date' }, { value: 'monthly', label: 'Monthly register' },
        { value: 'employee', label: 'By employee' }, { value: 'yearly', label: 'Yearly summary' }, { value: 'history', label: 'Modification history' },
      ]} />
      {tab === 'daily' && <DailyView />}
      {tab === 'monthly' && <MonthlyRegister />}
      {tab === 'employee' && <ByEmployee />}
      {tab === 'yearly' && <YearlyView />}
      {tab === 'history' && <HistoryView />}
    </>
  );
}

// ------------------------------------------------------------------ Daily
function DailyView() {
  const toast = useToast();
  const [date, setDate] = useState(todayIST());
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'present' | 'absent' | 'late' | 'half' | 'leave' | 'missing_out'>('all');
  const [target, setTarget] = useState<AttendanceTarget | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<'present' | 'absent' | null>(null);
  const { year, month } = { year: parseYMD(date).y, month: parseYMD(date).m };
  const { data, loading, error, reload } = useData(() => loadMonthData(year, month), [year, month]);

  const rows = useMemo(() => {
    if (!data) return [];
    return employedInMonth(data.employees, year, month)
      .filter((e) => e.date_of_joining <= date && (!e.inactive_from || e.inactive_from >= date))
      .map((e) => ({ emp: e, day: computePayroll(data, e).days.find((d) => d.date === date)! }))
      .filter(({ emp }) => !q || `${emp.employee_code} ${emp.full_name}`.toLowerCase().includes(q.toLowerCase()));
  }, [data, date, q, year, month]);

  const shown = rows.filter(({ day: d }) => {
    const day = { ...d, kind: effectiveKind(d) };
    switch (filter) {
      case 'present': return ['present', 'late_excused', 'half_day', 'late_half_day'].includes(day.kind);
      case 'absent': return day.kind === 'absent' || (day.kind === 'upcoming' && !day.attendance);
      case 'late': return day.attendance?.is_late;
      case 'half': return day.kind === 'half_day' || day.kind === 'late_half_day';
      case 'leave': return day.kind === 'paid_leave' || day.kind === 'unpaid_leave';
      case 'missing_out': return day.attendance?.sign_in_at && !day.attendance.sign_out_at;
      default: return true;
    }
  });

  const finalized = (empId: string) => data?.payroll.some((p) => p.employee_id === empId);
  const approveException = async (d: DayResult) => {
    try {
      await must(supabase.rpc('admin_set_late_exception', { p_attendance_id: d.attendance!.id, p_approve: true, p_reason: null }));
      toast('Late arrival approved as exception – counted as full day');
      reload();
    } catch (e) { toast(errMsg(e), 'error'); }
  };

  const counts = {
    present: rows.filter((r) => r.day.attendance && r.day.attendance.status !== 'absent').length,
    late: rows.filter((r) => r.day.attendance?.is_late).length,
    leave: rows.filter((r) => ['paid_leave', 'unpaid_leave'].includes(effectiveKind(r.day))).length,
    absent: rows.filter((r) => ['absent', 'upcoming'].includes(effectiveKind(r.day))).length,
  };

  return (
    <Card bodyClassName="p-0">
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></Button>
          <Input type="date" value={date} max={todayIST()} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-40" />
          <Button variant="secondary" size="sm" disabled={date >= todayIST()} onClick={() => setDate(addDays(date, 1))} aria-label="Next day"><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <span className="pb-2 text-sm text-slate-500">{WEEKDAYS[dayOfWeek(date)]}</span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee" className="w-52 pl-9" />
        </div>
        <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="w-48">
          <option value="all">All employees</option><option value="present">Present (incl. half)</option><option value="absent">Absent / not marked</option>
          <option value="late">Late arrivals</option><option value="half">Half days</option><option value="leave">On leave</option><option value="missing_out">Missing sign-out</option>
        </Select>
        <div className="ml-auto flex gap-2">
          <Badge tone="green">{counts.present} present</Badge><Badge tone="orange">{counts.late} late</Badge>
          <Badge tone="blue">{counts.leave} leave</Badge><Badge tone="red">{counts.absent} absent / not marked</Badge>
        </div>
      </div>
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-brand-100 bg-brand-50 px-4 py-2 text-sm">
          <span className="font-medium text-brand-800">{selected.size} selected</span>
          <Button size="sm" variant="success" icon={<CheckCheck className="h-3.5 w-3.5" />} onClick={() => setBulk('present')}>Mark present</Button>
          <Button size="sm" variant="danger" onClick={() => setBulk('absent')}>Mark absent</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}
      {loading ? <Loading /> : error ? <Alert tone="error" className="m-4">{error}</Alert> : !shown.length ? <EmptyState title="No employees match" /> : (
        <Table>
          <thead><tr>
            <Th><Checkbox label="" checked={shown.length > 0 && shown.every((r) => selected.has(r.emp.id))} onChange={(v) => setSelected(v ? new Set(shown.map((r) => r.emp.id)) : new Set())} /></Th>
            <Th>Employee</Th><Th>Status</Th><Th>Sign in</Th><Th>Sign out</Th><Th>Duration</Th><Th>Late</Th><Th className="text-right">Actions</Th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map(({ emp, day }) => {
              const a = day.attendance;
              const locked = finalized(emp.id);
              return (
                <tr key={emp.id} className="hover:bg-slate-50">
                  <Td><Checkbox label="" checked={selected.has(emp.id)} disabled={locked} onChange={(v) => setSelected((s) => { const n = new Set(s); if (v) n.add(emp.id); else n.delete(emp.id); return n; })} /></Td>
                  <Td><div className="font-medium text-slate-900">{emp.full_name}</div><div className="font-mono text-xs text-slate-500">{emp.employee_code}</div></Td>
                  <Td>
                    <Badge tone={kindTone(effectiveKind(day))}>{effectiveKind(day) === 'upcoming' ? 'Not signed in' : DAY_KIND_LABEL[effectiveKind(day)]}</Badge>
                    {day.note && day.kind !== 'late_half_day' && <div className="mt-0.5 text-xs text-slate-500">{day.note}</div>}
                    {a?.source === 'admin' && <div className="mt-0.5 text-xs text-slate-400">marked by admin</div>}
                  </Td>
                  <Td>{formatTime(a?.sign_in_at)}</Td>
                  <Td>{a?.sign_out_at ? formatTime(a.sign_out_at) : a?.sign_in_at ? <span className="text-xs text-orange-600">open</span> : '—'}</Td>
                  <Td>{minutesToHM(a?.total_minutes)}</Td>
                  <Td>{a?.is_late ? <span className="text-orange-700">{a.late_minutes} min{a.late_exception && <Badge tone="green" className="ml-1">excused</Badge>}</span> : '—'}</Td>
                  <Td className="text-right">
                    {locked ? <Badge tone="violet">payroll locked</Badge> : <div className="flex justify-end gap-1">
                      {a?.is_late && !a.late_exception && a.status === 'half_day' && <Button size="sm" variant="secondary" onClick={() => approveException(day)}>Approve exception</Button>}
                      <Button size="sm" variant="secondary" onClick={() => setTarget({ employeeId: emp.id, employeeName: emp.full_name, employeeCode: emp.employee_code, date, record: a ?? null })}>{a ? 'Edit' : 'Mark'}</Button>
                    </div>}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <AttendanceEditModal target={target} onClose={() => setTarget(null)} onSaved={reload} />
      {bulk && data && (
        <BulkModal status={bulk} date={date} employees={rows.filter((r) => selected.has(r.emp.id)).map((r) => ({ emp: r.emp, day: r.day }))}
          onClose={() => setBulk(null)} onDone={() => { setBulk(null); setSelected(new Set()); reload(); }} />
      )}
    </Card>
  );
}

function BulkModal({ status, date, employees, onClose, onDone }: {
  status: 'present' | 'absent'; date: string; employees: { emp: Employee; day: DayResult }[]; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [inT, setInT] = useState('10:00');
  const [outT, setOutT] = useState('18:00');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    if (reason.trim().length < 3) return setErr('A reason is mandatory');
    setBusy(true); setErr(null);
    let ok = 0; const failed: string[] = [];
    for (const { emp, day } of employees) {
      const a = day.attendance;
      const { error } = await supabase.rpc('admin_save_attendance', {
        p_employee_id: emp.id, p_work_date: date, p_status: status,
        p_sign_in_at: status === 'absent' ? null : a?.sign_in_at ?? `${date}T${inT}:00+05:30`,
        p_sign_out_at: status === 'absent' ? null : a?.sign_out_at ?? (outT ? `${date}T${outT}:00+05:30` : null),
        p_late_exception: status === 'present' ? Boolean(a?.is_late) : false,
        p_remarks: a?.remarks ?? null, p_reason: reason.trim(),
      });
      if (error) failed.push(`${emp.employee_code}: ${errMsg(error)}`); else ok++;
    }
    setBusy(false);
    if (failed.length) setErr(failed.join('\n')); else { toast(`${ok} record(s) marked ${status}`); onDone(); }
  };
  return (
    <Modal open onClose={onClose} title={`Mark ${employees.length} employee(s) ${status} on ${formatDate(date)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={go}>Apply</Button></>}>
      {status === 'present' && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Field label="Sign-in (if none recorded)"><Input type="time" value={inT} onChange={(e) => setInT(e.target.value)} /></Field>
          <Field label="Sign-out (if none recorded)"><Input type="time" value={outT} onChange={(e) => setOutT(e.target.value)} /></Field>
          <p className="col-span-2 text-xs text-slate-500">Marking present as admin counts as a full day (late arrivals are approved as exceptions).</p>
        </div>
      )}
      <Field label="Reason" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      {err && <Alert tone="error" className="mt-3 whitespace-pre-line">{err}</Alert>}
    </Modal>
  );
}

// ------------------------------------------------------------------ Monthly register
function MonthlyRegister() {
  const [ym, setYm] = useState(currentYearMonth());
  const [target, setTarget] = useState<AttendanceTarget | null>(null);
  const { data, loading, error, reload } = useData(async () => {
    const d = await loadMonthData(ym.year, ym.month);
    return { d, results: computeAll(d) };
  }, [ym.year, ym.month]);

  const emps = data ? employedInMonth(data.d.employees, ym.year, ym.month) : [];
  const exportCsv = () => {
    if (!data) return;
    const dates = data.results.values().next().value?.days.map((x) => x.date) ?? [];
    const code = (k: DayKind) => ({ present: 'P', late_excused: 'P*', half_day: 'HD', late_half_day: 'L/HD', absent: 'A', paid_leave: 'PL', unpaid_leave: 'UL', holiday_paid: 'H', holiday_unpaid: 'H(U)', weekly_off_paid: 'WO', weekly_off_unpaid: 'WO', not_employed: '', upcoming: '' })[k];
    downloadCSV(`attendance-register-${ym.year}-${String(ym.month).padStart(2, '0')}.csv`,
      ['Employee ID', 'Name', ...dates.map((d) => d.slice(8)), 'Present', 'Half days', 'Late', 'Paid leave', 'Unpaid leave', 'Absent', 'Payable days'],
      emps.map((e) => {
        const r = data.results.get(e.id)!;
        return [e.employee_code, e.full_name, ...r.days.map((x) => code(x.kind)), r.counts.present, r.counts.halfDays, r.counts.lateArrivals, r.counts.paidLeave, r.counts.unpaidLeave, r.counts.absent, r.payableDays];
      }));
  };

  return (
    <Card title={<MonthPicker year={ym.year} month={ym.month} onChange={(year, month) => setYm({ year, month })} />}
      actions={<Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!data}>Export CSV</Button>} bodyClassName="p-0">
      <div className="px-4 py-3"><Legend /></div>
      {loading ? <Loading /> : error ? <Alert tone="error" className="m-4">{error}</Alert> : !emps.length ? <EmptyState title="No employees in this month" /> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600">Employee</th>
                {data!.results.get(emps[0].id)!.days.map((d) => (
                  <th key={d.date} className={clsx('px-0.5 py-2 text-center font-medium', dayOfWeek(d.date) === 0 ? 'text-red-500' : 'text-slate-500')}>
                    {Number(d.date.slice(8))}<div className="text-[9px] font-normal">{WEEKDAYS[dayOfWeek(d.date)][0]}</div>
                  </th>
                ))}
                <th className="px-2 py-2 text-center font-semibold text-slate-600">P</th>
                <th className="px-2 py-2 text-center font-semibold text-slate-600">HD</th>
                <th className="px-2 py-2 text-center font-semibold text-slate-600">L</th>
                <th className="px-2 py-2 text-center font-semibold text-slate-600">A</th>
                <th className="px-2 py-2 text-center font-semibold text-slate-600">Payable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {emps.map((e) => {
                const r = data!.results.get(e.id)!;
                const locked = data!.d.payroll.some((p) => p.employee_id === e.id);
                return (
                  <tr key={e.id}>
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-1.5"><div className="font-medium text-slate-800">{e.full_name}</div><div className="font-mono text-[10px] text-slate-500">{e.employee_code}</div></td>
                    {r.days.map((d) => (
                      <td key={d.date} className="px-0.5 py-1">
                        <button
                          title={`${formatDate(d.date)} – ${DAY_KIND_LABEL[d.kind]}${d.note ? ` (${d.note})` : ''}`}
                          disabled={locked || d.kind === 'not_employed' || d.date > todayIST()}
                          onClick={() => setTarget({ employeeId: e.id, employeeName: e.full_name, employeeCode: e.employee_code, date: d.date, record: d.attendance ?? null })}
                          className={clsx('h-6 w-6 rounded text-[10px] font-semibold enabled:hover:ring-2 enabled:hover:ring-brand-400', KIND_STYLE[d.kind])}
                        >{d.kind === 'late_half_day' ? 'L' : d.kind === 'half_day' ? '½' : ''}</button>
                      </td>
                    ))}
                    <td className="px-2 text-center font-semibold">{r.counts.present}</td>
                    <td className="px-2 text-center">{r.counts.halfDays}</td>
                    <td className="px-2 text-center">{r.counts.lateArrivals}</td>
                    <td className="px-2 text-center text-red-600">{r.counts.absent}</td>
                    <td className="px-2 text-center font-semibold">{fmtDays(r.payableDays)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <AttendanceEditModal target={target} onClose={() => setTarget(null)} onSaved={reload} />
    </Card>
  );
}

// ------------------------------------------------------------------ By employee
function useEmployeeOptions() {
  return useData(() => fetchEmployees(), []);
}

function ByEmployee() {
  const { data: employees, loading } = useEmployeeOptions();
  const [id, setId] = useState('');
  const emp = employees?.find((e) => e.id === id);
  if (loading) return <Loading />;
  return (
    <div className="space-y-5">
      <Card>
        <Field label="Employee" className="max-w-md">
          <Select value={id} onChange={(e) => setId(e.target.value)}>
            <option value="">Select an employee…</option>
            {employees?.map((e) => <option key={e.id} value={e.id}>{e.employee_code} – {e.full_name}{e.status === 'inactive' ? ' (inactive)' : ''}</option>)}
          </Select>
        </Field>
      </Card>
      {emp && <MonthAttendance key={emp.id} employee={emp} editable />}
    </div>
  );
}

// ------------------------------------------------------------------ Yearly
function YearlyView() {
  const { data: employees } = useEmployeeOptions();
  const [id, setId] = useState('');
  const [year, setYear] = useState(currentYearMonth().year);
  const { data, loading, error } = useData(async () => {
    if (!id) return null;
    const d = await loadRangeData(`${year}-01-01`, `${year}-12-31`, id);
    const emp = d.employees[0];
    if (!emp) return null;
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const employed = employedInMonth([emp], year, m).length > 0;
      return { m, r: employed ? computePayroll(withMonth(d, year, m), emp) : null };
    });
  }, [id, year]);
  const years = Array.from({ length: 6 }, (_, i) => currentYearMonth().year - i);
  const total = (f: (r: NonNullable<NonNullable<typeof data>[number]['r']>) => number) =>
    (data ?? []).reduce((s, x) => s + (x.r ? f(x.r) : 0), 0);

  return (
    <Card bodyClassName="p-0">
      <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
        <Select value={id} onChange={(e) => setId(e.target.value)} className="max-w-sm">
          <option value="">Select an employee…</option>
          {employees?.map((e) => <option key={e.id} value={e.id}>{e.employee_code} – {e.full_name}</option>)}
        </Select>
        <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28">{years.map((y) => <option key={y}>{y}</option>)}</Select>
      </div>
      {!id ? <EmptyState title="Choose an employee to see the yearly summary" /> : loading ? <Loading /> : error ? <Alert tone="error" className="m-4">{error}</Alert> : (
        <Table>
          <thead><tr><Th>Month</Th><Th>Present</Th><Th>Half days</Th><Th>Late</Th><Th>Paid leave</Th><Th>Unpaid leave</Th><Th>Holidays</Th><Th>Absent</Th><Th>Payable days</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data?.map(({ m, r }) => (
              <tr key={m}>
                <Td className="font-medium">{MONTHS[m - 1]}</Td>
                {r ? <>
                  <Td>{r.counts.present}</Td><Td>{r.counts.halfDays}</Td><Td>{r.counts.lateArrivals}</Td><Td>{r.counts.paidLeave}</Td>
                  <Td>{r.counts.unpaidLeave}</Td><Td>{r.counts.paidHolidays + r.counts.unpaidHolidays}</Td><Td className="text-red-600">{r.counts.absent}</Td>
                  <Td className="font-semibold">{fmtDays(r.payableDays)}</Td>
                </> : <Td colSpan={8} className="text-slate-400">Not employed</Td>}
              </tr>
            ))}
            <tr className="bg-slate-50 font-semibold">
              <Td>Total {year}</Td><Td>{total((r) => r.counts.present)}</Td><Td>{total((r) => r.counts.halfDays)}</Td><Td>{total((r) => r.counts.lateArrivals)}</Td>
              <Td>{total((r) => r.counts.paidLeave)}</Td><Td>{total((r) => r.counts.unpaidLeave)}</Td><Td>{total((r) => r.counts.paidHolidays + r.counts.unpaidHolidays)}</Td>
              <Td>{total((r) => r.counts.absent)}</Td><Td>{fmtDays(total((r) => r.payableDays))}</Td>
            </tr>
          </tbody>
        </Table>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ History
function HistoryView() {
  const { data, loading, error } = useData(async () => {
    const [hist, emps] = await Promise.all([
      must(supabase.from('attendance_history').select('*').order('changed_at', { ascending: false }).limit(300)) as Promise<AttendanceHistory[]>,
      fetchEmployees(),
    ]);
    return { hist, emps: new Map(emps.map((e) => [e.id, e])) };
  }, []);
  if (loading) return <Loading />;
  if (error) return <Alert tone="error">{error}</Alert>;
  return (
    <Card bodyClassName="p-0" title="Latest 300 attendance modifications">
      {!data?.hist.length ? <EmptyState title="No modifications yet" /> : (
        <Table>
          <thead><tr><Th>When</Th><Th>Employee</Th><Th>Work date</Th><Th>Action</Th><Th>Change</Th><Th>Reason</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.hist.map((h) => {
              const e = data.emps.get(h.employee_id);
              return (
                <tr key={h.id}>
                  <Td className="text-xs text-slate-500">{formatDateTime(h.changed_at)}</Td>
                  <Td>{e ? `${e.employee_code} – ${e.full_name}` : '—'}</Td>
                  <Td>{formatDate(h.work_date)}</Td>
                  <Td><Badge tone="brand">{h.action.replace(/_/g, ' ')}</Badge></Td>
                  <Td className="text-xs">{h.old_data?.status ?? '∅'} → {h.new_data?.status ?? 'deleted'}{h.new_data?.sign_in_at ? ` · in ${formatTime(h.new_data.sign_in_at)}` : ''}{h.new_data?.sign_out_at ? ` · out ${formatTime(h.new_data.sign_out_at)}` : ''}</Td>
                  <Td className="max-w-xs whitespace-normal text-xs">{h.reason}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

