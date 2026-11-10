import { Download, FileDown, Play } from 'lucide-react';
import { useState } from 'react';
import { Alert, Button, Card, Field, Input, MonthPicker, PageHeader, Select, Table, Td, Th } from '../../components/ui';
import {
  computeAll, employedInMonth, fetchAll, fetchAttendance, fetchEmployees, fetchHolidays, fetchLeaveTypes, fetchRevisions, loadMonthData, snapshotOf,
} from '../../lib/api';
import { currentYearMonth, formatDate, formatTime, monthLabel, monthStart, todayIST } from '../../lib/dates';
import { downloadCSV } from '../../lib/export';
import { days as fmtDays } from '../../lib/format';
import { tablePDF } from '../../lib/pdf';
import { salaryOn } from '../../lib/salary';
import { supabase } from '../../lib/supabase';
import { HOLIDAY_CATEGORIES, PENALTY_CATEGORIES, type LeaveRequest, type Penalty } from '../../lib/types';

type ReportKey = 'attendance_summary' | 'attendance_log' | 'payroll' | 'leaves' | 'penalties' | 'employees' | 'holidays';
const REPORTS: { key: ReportKey; label: string; period: 'month' | 'range' | 'year' | 'none' }[] = [
  { key: 'attendance_summary', label: 'Monthly attendance summary', period: 'month' },
  { key: 'attendance_log', label: 'Daily attendance log (sign-in / sign-out)', period: 'range' },
  { key: 'payroll', label: 'Payroll / salary register', period: 'month' },
  { key: 'leaves', label: 'Leave applications', period: 'range' },
  { key: 'penalties', label: 'Penalties (by deduction month)', period: 'month' },
  { key: 'employees', label: 'Employee directory', period: 'none' },
  { key: 'holidays', label: 'Holiday calendar', period: 'year' },
];

interface Built { title: string; head: string[]; rows: (string | number)[][] }

export default function ReportsPage() {
  const [key, setKey] = useState<ReportKey>('attendance_summary');
  const [ym, setYm] = useState(currentYearMonth());
  const [from, setFrom] = useState(monthStart(ym.year, ym.month));
  const [to, setTo] = useState(todayIST());
  const [year, setYear] = useState(ym.year);
  const [built, setBuilt] = useState<Built | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const def = REPORTS.find((r) => r.key === key)!;

  const build = async (): Promise<Built> => {
    switch (key) {
      case 'attendance_summary': {
        const d = await loadMonthData(ym.year, ym.month);
        const res = computeAll(d);
        return {
          title: `Attendance summary – ${monthLabel(ym.year, ym.month)}`,
          head: ['Employee ID', 'Name', 'Present', 'Half days', 'Late arrivals', 'Late excused', 'Paid leave', 'Unpaid leave', 'Paid holidays', 'Weekly offs', 'Absent', 'Payable days'],
          rows: employedInMonth(d.employees, ym.year, ym.month).map((e) => {
            const c = res.get(e.id)!.counts;
            return [e.employee_code, e.full_name, c.present, c.halfDays, c.lateArrivals, c.lateExcused, c.paidLeave, c.unpaidLeave, c.paidHolidays, c.weeklyOffsPaid + c.weeklyOffsUnpaid, c.absent, fmtDays(res.get(e.id)!.payableDays)];
          }),
        };
      }
      case 'attendance_log': {
        const [att, emps] = await Promise.all([fetchAttendance(from, to), fetchEmployees()]);
        const m = new Map(emps.map((e) => [e.id, e]));
        return {
          title: `Attendance log ${formatDate(from)} – ${formatDate(to)}`,
          head: ['Date', 'Employee ID', 'Name', 'Status', 'Sign in', 'Sign out', 'Hours', 'Late (min)', 'Exception', 'Source', 'Remarks'],
          rows: att.sort((a, b) => a.work_date.localeCompare(b.work_date) || (m.get(a.employee_id)?.employee_code ?? '').localeCompare(m.get(b.employee_id)?.employee_code ?? ''))
            .map((a) => [a.work_date, m.get(a.employee_id)?.employee_code ?? '', m.get(a.employee_id)?.full_name ?? '', a.status.replace('_', ' '), formatTime(a.sign_in_at), formatTime(a.sign_out_at) + (a.auto_signed_out ? ' (auto)' : ''),
              (a.total_minutes / 60).toFixed(2), a.is_late ? a.late_minutes : '', a.late_exception ? 'Yes' : '', a.source, a.remarks ?? '']),
        };
      }
      case 'payroll': {
        const d = await loadMonthData(ym.year, ym.month);
        const res = computeAll(d);
        return {
          title: `Payroll register – ${monthLabel(ym.year, ym.month)}`,
          head: ['Employee ID', 'Name', 'Monthly salary', 'Daily salary', 'Payable days', 'Earned', 'Penalties', 'Deductions', 'Additions', 'Net salary', 'Status'],
          rows: employedInMonth(d.employees, ym.year, ym.month).map((e) => {
            const rec = d.payroll.find((p) => p.employee_id === e.id);
            const s = rec ? snapshotOf(rec) : res.get(e.id)!;
            return [e.employee_code, e.full_name, s.monthlySalary.toFixed(2), s.dailyRate.toFixed(2), fmtDays(s.payableDays), s.grossEarned.toFixed(2), s.penaltiesTotal.toFixed(2), s.deductionsTotal.toFixed(2), s.additionsTotal.toFixed(2), s.netSalary.toFixed(2), rec ? 'Finalised' : 'Draft'];
          }),
        };
      }
      case 'leaves': {
        const [leaves, emps, types] = await Promise.all([
          fetchAll<LeaveRequest>((f, t) => supabase.from('leave_requests').select('*').lte('start_date', to).gte('end_date', from).order('start_date').range(f, t)),
          fetchEmployees(), fetchLeaveTypes(),
        ]);
        const m = new Map(emps.map((e) => [e.id, e]));
        return {
          title: `Leave applications ${formatDate(from)} – ${formatDate(to)}`,
          head: ['Employee ID', 'Name', 'Leave type', 'Paid', 'From', 'To', 'Days', 'Status', 'Reason', 'Admin comment', 'Applied on'],
          rows: leaves.map((l) => {
            const t = types.find((x) => x.id === l.leave_type_id);
            return [m.get(l.employee_id)?.employee_code ?? '', m.get(l.employee_id)?.full_name ?? '', t?.name ?? '', t?.is_paid ? 'Yes' : 'No', l.start_date, l.end_date, l.days, l.status, l.reason, l.admin_comment ?? '', l.created_at.slice(0, 10)];
          }),
        };
      }
      case 'penalties': {
        const [pens, emps] = await Promise.all([
          fetchAll<Penalty>((f, t) => supabase.from('penalties').select('*').eq('deduction_year', ym.year).eq('deduction_month', ym.month).order('penalty_date').range(f, t)),
          fetchEmployees(),
        ]);
        const m = new Map(emps.map((e) => [e.id, e]));
        return {
          title: `Penalties – ${monthLabel(ym.year, ym.month)}`,
          head: ['Employee ID', 'Employee name', 'Date', 'Category', 'Type', 'Reason', 'Amount', 'Status'],
          rows: pens.map((p) => [m.get(p.employee_id)?.employee_code ?? '', m.get(p.employee_id)?.full_name ?? '', p.penalty_date, PENALTY_CATEGORIES.find((c) => c.value === p.category)?.label ?? '', p.penalty_type, p.reason, Number(p.amount).toFixed(2), p.status]),
        };
      }
      case 'employees': {
        const [emps, revs] = await Promise.all([fetchEmployees(), fetchRevisions()]);
        return {
          title: 'Employee directory',
          head: ['Employee ID', 'Name', 'Designation', 'Status', 'DOB', 'DOJ', 'Email', 'Phone', 'Alt. phone', 'Relation', 'Blood group', 'Monthly salary'],
          rows: emps.map((e) => [e.employee_code, e.full_name, e.designation, e.status, e.date_of_birth, e.date_of_joining, e.email ?? '', e.phone, e.alt_phone ?? '', e.alt_contact_relation ?? '', e.blood_group ?? '',
            salaryOn(revs.filter((r) => r.employee_id === e.id), todayIST()).toFixed(2)]),
        };
      }
      case 'holidays': {
        const hs = await fetchHolidays(`${year}-01-01`, `${year}-12-31`);
        return {
          title: `Holiday calendar ${year}`,
          head: ['Date', 'Holiday', 'Category', 'Paid', 'Applies to', 'Description'],
          rows: hs.map((h) => [h.holiday_date, h.name, HOLIDAY_CATEGORIES.find((c) => c.value === h.category)?.label ?? '', h.is_paid ? 'Paid' : 'Unpaid', h.applies_to_all ? 'All' : `${h.holiday_employees?.length ?? 0} employees`, h.description ?? '']),
        };
      }
    }
  };

  const run = async () => {
    setBusy(true); setErr(null);
    try { setBuilt(await build()); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  return (
    <>
      <PageHeader title="Reports & Export" subtitle="Generate a report, preview it, and download as CSV (opens in Excel) or PDF." />
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Report" className="w-80">
            <Select value={key} onChange={(e) => { setKey(e.target.value as ReportKey); setBuilt(null); }}>
              {REPORTS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </Select>
          </Field>
          {def.period === 'month' && <Field label="Month"><MonthPicker year={ym.year} month={ym.month} onChange={(y, m) => setYm({ year: y, month: m })} /></Field>}
          {def.period === 'range' && <>
            <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </>}
          {def.period === 'year' && <Field label="Year"><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" /></Field>}
          <Button icon={<Play className="h-4 w-4" />} loading={busy} onClick={run}>Generate</Button>
          {built && <>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => downloadCSV(`${slug(built.title)}.csv`, built.head, built.rows)}>CSV</Button>
            <Button variant="secondary" icon={<FileDown className="h-4 w-4" />} onClick={() => tablePDF({ title: built.title, head: built.head, body: built.rows, filename: `${slug(built.title)}.pdf`, landscape: built.head.length > 7 })}>PDF</Button>
          </>}
        </div>
        {err && <Alert tone="error" className="mt-4">{err}</Alert>}
      </Card>
      {built && (
        <Card className="mt-5" title={`${built.title} · ${built.rows.length} row(s)`} bodyClassName="p-0">
          <Table>
            <thead><tr>{built.head.map((h) => <Th key={h}>{h}</Th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {built.rows.slice(0, 50).map((r, i) => <tr key={i}>{r.map((c, j) => <Td key={j}>{String(c)}</Td>)}</tr>)}
            </tbody>
          </Table>
          {built.rows.length > 50 && <p className="px-5 py-3 text-xs text-slate-500">Preview shows the first 50 rows; downloads contain all {built.rows.length}.</p>}
        </Card>
      )}
    </>
  );
}

