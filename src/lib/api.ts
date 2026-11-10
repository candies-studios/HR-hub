import { supabase, must } from './supabase';
import { monthEnd, monthStart, todayIST } from './dates';
import { calculatePayroll, holidaysFor, type PayrollResult } from './salary';
import type {
  Attendance, Employee, Holiday, LeaveRequest, LeaveType, OrgSettings, PayrollRecord, Penalty, SalaryAdjustment, SalaryRevision,
} from './types';

const PAGE = 1000;

/** PostgREST returns at most 1000 rows per request – page through everything. */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = await must(build(from, from + PAGE - 1));
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export const fetchSettings = () =>
  must(supabase.from('org_settings').select('*').eq('id', 1).single()) as Promise<OrgSettings>;

export const fetchEmployees = () =>
  fetchAll<Employee>((f, t) => supabase.from('employees').select('*').order('employee_code').range(f, t));

export const fetchLeaveTypes = () =>
  must(supabase.from('leave_types').select('*').order('sort_order').order('name')) as Promise<LeaveType[]>;

export const fetchHolidays = (from: string, to: string) =>
  fetchAll<Holiday>((f, t) =>
    supabase.from('holidays').select('*, holiday_employees(employee_id)')
      .gte('holiday_date', from).lte('holiday_date', to).order('holiday_date').range(f, t));

export const fetchAttendance = (from: string, to: string, employeeId?: string) =>
  fetchAll<Attendance>((f, t) => {
    let q = supabase.from('attendance').select('*').gte('work_date', from).lte('work_date', to);
    if (employeeId) q = q.eq('employee_id', employeeId);
    return q.order('work_date').range(f, t);
  });

export const fetchRevisions = (employeeId?: string) =>
  fetchAll<SalaryRevision>((f, t) => {
    let q = supabase.from('salary_revisions').select('*');
    if (employeeId) q = q.eq('employee_id', employeeId);
    return q.order('effective_date').range(f, t);
  });

/** Approved leaves overlapping a date range */
export const fetchApprovedLeaves = (from: string, to: string, employeeId?: string) =>
  fetchAll<LeaveRequest>((f, t) => {
    let q = supabase.from('leave_requests').select('*').eq('status', 'approved').lte('start_date', to).gte('end_date', from);
    if (employeeId) q = q.eq('employee_id', employeeId);
    return q.range(f, t);
  });

export interface MonthData {
  year: number;
  month: number;
  today: string;
  settings: OrgSettings;
  employees: Employee[];
  revisions: SalaryRevision[];
  attendance: Attendance[];
  leaves: LeaveRequest[];
  leaveTypes: LeaveType[];
  holidays: Holiday[];
  penalties: Penalty[];
  adjustments: SalaryAdjustment[];
  payroll: PayrollRecord[];
}

/** Everything needed to compute payroll for any month inside [from, to]. RLS limits an employee to their own rows. */
export async function loadRangeData(from: string, to: string, employeeId?: string): Promise<MonthData> {
  // close login sessions that were left open on earlier days (forgot to log out → office end time)
  await supabase.rpc('close_stale_sessions').then(() => undefined, () => undefined);
  const y1 = Number(from.slice(0, 4));
  const y2 = Number(to.slice(0, 4));
  const [settings, employees, revisions, attendance, leaves, leaveTypes, holidays, penalties, adjustments, payroll] = await Promise.all([
    fetchSettings(),
    employeeId
      ? must(supabase.from('employees').select('*').eq('id', employeeId)) as Promise<Employee[]>
      : fetchEmployees(),
    fetchRevisions(employeeId),
    fetchAttendance(from, to, employeeId),
    fetchApprovedLeaves(from, to, employeeId),
    fetchLeaveTypes(),
    fetchHolidays(from, to),
    fetchAll<Penalty>((f, t) => {
      let q = supabase.from('penalties').select('*').gte('deduction_year', y1).lte('deduction_year', y2);
      if (employeeId) q = q.eq('employee_id', employeeId);
      return q.range(f, t);
    }),
    fetchAll<SalaryAdjustment>((f, t) => {
      let q = supabase.from('salary_adjustments').select('*').gte('year', y1).lte('year', y2);
      if (employeeId) q = q.eq('employee_id', employeeId);
      return q.range(f, t);
    }),
    fetchAll<PayrollRecord>((f, t) => {
      let q = supabase.from('payroll_records').select('*').gte('year', y1).lte('year', y2);
      if (employeeId) q = q.eq('employee_id', employeeId);
      return q.range(f, t);
    }),
  ]);
  const { y, m } = { y: Number(to.slice(0, 4)), m: Number(to.slice(5, 7)) };
  return { year: y, month: m, today: todayIST(), settings, employees, revisions, attendance, leaves, leaveTypes, holidays, penalties, adjustments, payroll };
}

export const loadMonthData = async (year: number, month: number, employeeId?: string) => {
  const d = await loadRangeData(monthStart(year, month), monthEnd(year, month), employeeId);
  return withMonth(d, year, month);
};

/** Re-target range data at one month (payroll records filtered to that month). */
export const withMonth = (d: MonthData, year: number, month: number): MonthData => ({
  ...d, year, month, payroll: d.payroll.filter((p) => p.year === year && p.month === month),
});

/** Employees who were on the rolls for at least one day of the month */
export const employedInMonth = (employees: Employee[], year: number, month: number) => {
  const from = monthStart(year, month);
  const to = monthEnd(year, month);
  return employees.filter((e) => e.date_of_joining <= to && (!e.inactive_from || e.inactive_from >= from));
};

export function computePayroll(data: MonthData, employee: Employee): PayrollResult {
  return calculatePayroll({
    employee,
    year: data.year,
    month: data.month,
    today: data.today,
    settings: data.settings,
    revisions: data.revisions,
    attendance: data.attendance,
    leaves: data.leaves,
    leaveTypes: data.leaveTypes,
    holidays: holidaysFor(data.holidays, employee.id),
    penalties: data.penalties,
    adjustments: data.adjustments,
  });
}

export function computeAll(data: MonthData): Map<string, PayrollResult> {
  const out = new Map<string, PayrollResult>();
  for (const e of employedInMonth(data.employees, data.year, data.month)) out.set(e.id, computePayroll(data, e));
  return out;
}

/** For a finalised month, the frozen snapshot is authoritative. */
export const snapshotOf = (rec: PayrollRecord) => rec.calc as PayrollResult;
