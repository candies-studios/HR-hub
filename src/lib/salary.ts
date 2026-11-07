/**
 * Salary engine – the single source of truth for payroll figures.
 *
 *   Daily Salary          = Monthly Salary / calendar days in that month
 *   Payable Days          = Full Present + (Half Days × 0.5) + Approved Paid Leave
 *                           (+ paid holidays and paid weekly offs, as configured)
 *   Monthly Earned Salary = Σ (daily salary of the day × payable fraction of the day)
 *   Net Salary            = Earned − Financial Penalties − Other Deductions + Additions
 *
 * Each calendar day is classified exactly ONCE (attendance > holiday > weekly off
 * > approved leave > absent), so an absence or a late arrival can never be deducted
 * twice. Salary revisions are effective-dated: the rate of each day is the salary in
 * force on that day, so later revisions never change earlier months.
 */
import { dayOfWeek, daysInMonth, monthDates, monthEnd, monthStart } from './dates';
import type {
  Attendance, Holiday, LeaveRequest, LeaveType, OrgSettings, Penalty, SalaryAdjustment, SalaryRevision,
} from './types';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type DayKind =
  | 'present' | 'late_excused' | 'half_day' | 'late_half_day' | 'absent'
  | 'paid_leave' | 'unpaid_leave' | 'holiday_paid' | 'holiday_unpaid'
  | 'weekly_off_paid' | 'weekly_off_unpaid' | 'not_employed' | 'upcoming';

export const DAY_KIND_LABEL: Record<DayKind, string> = {
  present: 'Present',
  late_excused: 'Late (exception approved)',
  half_day: 'Half day',
  late_half_day: 'Late arrival – half day',
  absent: 'Absent',
  paid_leave: 'Paid leave',
  unpaid_leave: 'Unpaid leave',
  holiday_paid: 'Paid holiday',
  holiday_unpaid: 'Unpaid holiday',
  weekly_off_paid: 'Weekly off (paid)',
  weekly_off_unpaid: 'Weekly off (unpaid)',
  not_employed: 'Not employed',
  upcoming: 'Upcoming',
};

export interface DayResult {
  date: string;
  kind: DayKind;
  fraction: number;
  dailyRate: number;
  amount: number;
  note?: string;
  attendance?: Attendance;
  /** for days not yet elapsed: what the day is planned to be (holiday, weekly off, approved leave) */
  planned?: DayKind;
}

export interface PayrollCounts {
  present: number;
  lateExcused: number;
  halfDays: number;
  lateArrivals: number;
  absent: number;
  paidLeave: number;
  unpaidLeave: number;
  paidHolidays: number;
  unpaidHolidays: number;
  weeklyOffsPaid: number;
  weeklyOffsUnpaid: number;
  notEmployed: number;
  upcoming: number;
}

export interface PayrollResult {
  employeeId: string;
  year: number;
  month: number;
  daysInMonth: number;
  monthlySalary: number;          // salary in force at month end (or last employed day)
  dailyRate: number;              // monthlySalary / daysInMonth (rounded for display)
  salaryChangedMidMonth: boolean;
  salaryConfigured: boolean;
  counts: PayrollCounts;
  payableDays: number;
  grossEarned: number;
  penaltiesTotal: number;
  deductionsTotal: number;
  additionsTotal: number;
  netSalary: number;
  isComplete: boolean;            // false while the month is still running
  days: DayResult[];
  penalties: Penalty[];
  adjustments: SalaryAdjustment[];
}

export interface PayrollInput {
  employee: { id: string; date_of_joining: string; inactive_from: string | null };
  year: number;
  month: number;
  today: string;
  settings: Pick<OrgSettings, 'weekly_off_days' | 'weekly_off_paid'>;
  revisions: SalaryRevision[];
  attendance: Attendance[];
  leaves: LeaveRequest[];        // any status; only approved are used
  leaveTypes: LeaveType[];
  holidays: Holiday[];           // already filtered to those applicable to this employee
  penalties: Penalty[];          // any; filtered to active+financial for this month
  adjustments: SalaryAdjustment[];
}

/** Salary in force on a date (latest revision with effective_date <= date). */
export function salaryOn(revisions: SalaryRevision[], date: string): number {
  let best: SalaryRevision | undefined;
  for (const r of revisions) {
    if (r.effective_date <= date && (!best || r.effective_date > best.effective_date)) best = r;
  }
  return best ? Number(best.monthly_salary) : 0;
}

export const dailySalary = (monthly: number, year: number, month: number) => round2(monthly / daysInMonth(year, month));

const emptyCounts = (): PayrollCounts => ({
  present: 0, lateExcused: 0, halfDays: 0, lateArrivals: 0, absent: 0, paidLeave: 0, unpaidLeave: 0,
  paidHolidays: 0, unpaidHolidays: 0, weeklyOffsPaid: 0, weeklyOffsUnpaid: 0, notEmployed: 0, upcoming: 0,
});

export function calculatePayroll(input: PayrollInput): PayrollResult {
  const { employee, year, month, today, settings } = input;
  const dim = daysInMonth(year, month);
  const dates = monthDates(year, month);
  const typeById = new Map(input.leaveTypes.map((t) => [t.id, t]));
  const attByDate = new Map(input.attendance.filter((a) => a.employee_id === employee.id).map((a) => [a.work_date, a]));
  const holidayByDate = new Map(input.holidays.map((h) => [h.holiday_date, h]));
  const approvedLeaves = input.leaves.filter((l) => l.employee_id === employee.id && l.status === 'approved');
  const revisions = input.revisions.filter((r) => r.employee_id === employee.id);
  const offs = new Set(settings.weekly_off_days ?? []);

  const counts = emptyCounts();
  const days: DayResult[] = [];
  let grossRaw = 0;
  let payable = 0;
  const ratesSeen = new Set<number>();

  for (const date of dates) {
    const monthly = salaryOn(revisions, date);
    const rate = monthly / dim;
    let kind: DayKind;
    let fraction = 0;
    let note: string | undefined;
    let planned: DayKind | undefined;
    const att = attByDate.get(date);

    const employed = date >= employee.date_of_joining && (!employee.inactive_from || date <= employee.inactive_from);
    if (!employed) {
      kind = 'not_employed';
      counts.notEmployed++;
    } else if (att) {
      // 1. actual attendance wins over everything else
      if (att.is_late) counts.lateArrivals++;
      if (att.status === 'present') {
        if (att.is_late && att.late_exception) {
          kind = 'late_excused'; counts.lateExcused++;
          note = att.late_exception_reason ?? 'Late arrival approved as exception';
        } else {
          kind = 'present';
        }
        counts.present++;
        fraction = 1;
      } else if (att.status === 'half_day') {
        kind = att.is_late ? 'late_half_day' : 'half_day';
        counts.halfDays++;
        fraction = 0.5;
        if (att.is_late) note = `Late by ${att.late_minutes} min`;
      } else {
        kind = 'absent'; counts.absent++;
      }
    } else {
      // classify a day without attendance: holiday > weekly off > approved leave > absent
      const holiday = holidayByDate.get(date);
      const leave = approvedLeaves.find((l) => l.start_date <= date && l.end_date >= date);
      const type = leave ? typeById.get(leave.leave_type_id) : undefined;
      let k: DayKind;
      let f = 0;
      if (holiday) { note = holiday.name; k = holiday.is_paid ? 'holiday_paid' : 'holiday_unpaid'; f = holiday.is_paid ? 1 : 0; }
      else if (offs.has(dayOfWeek(date))) { k = settings.weekly_off_paid ? 'weekly_off_paid' : 'weekly_off_unpaid'; f = settings.weekly_off_paid ? 1 : 0; }
      else if (leave) { note = type?.name; k = type?.is_paid ? 'paid_leave' : 'unpaid_leave'; f = type?.is_paid ? 1 : 0; }
      else k = 'absent';

      if (date >= today) {
        // the day has not finished yet: nothing is paid or counted until it has
        kind = 'upcoming';
        counts.upcoming++;
        planned = k === 'absent' ? undefined : k;
      } else {
        kind = k;
        fraction = f;
        switch (k) {
          case 'holiday_paid': counts.paidHolidays++; break;
          case 'holiday_unpaid': counts.unpaidHolidays++; break;
          case 'weekly_off_paid': counts.weeklyOffsPaid++; break;
          case 'weekly_off_unpaid': counts.weeklyOffsUnpaid++; break;
          case 'paid_leave': counts.paidLeave++; break;
          case 'unpaid_leave': counts.unpaidLeave++; break;
          default: counts.absent++;
        }
      }
    }

    const amount = rate * fraction;
    if (employed) ratesSeen.add(monthly);
    grossRaw += amount;
    payable += fraction;
    days.push({ date, kind, fraction, dailyRate: round2(rate), amount: round2(amount), note, attendance: att, planned });
  }

  const penalties = input.penalties.filter(
    (p) => p.employee_id === employee.id && p.status === 'active' && p.penalty_type === 'financial'
      && p.deduction_year === year && p.deduction_month === month,
  );
  const adjustments = input.adjustments.filter((a) => a.employee_id === employee.id && a.year === year && a.month === month);

  const penaltiesTotal = round2(penalties.reduce((s, p) => s + Number(p.amount), 0));
  const deductionsTotal = round2(adjustments.filter((a) => a.adj_type === 'deduction').reduce((s, a) => s + Number(a.amount), 0));
  const additionsTotal = round2(adjustments.filter((a) => a.adj_type === 'addition').reduce((s, a) => s + Number(a.amount), 0));
  const grossEarned = round2(grossRaw);
  const netSalary = round2(grossEarned - penaltiesTotal - deductionsTotal + additionsTotal);

  const lastEmployed = employee.inactive_from && employee.inactive_from < monthEnd(year, month) ? employee.inactive_from : monthEnd(year, month);
  const monthlySalary = salaryOn(revisions, lastEmployed < monthStart(year, month) ? monthStart(year, month) : lastEmployed);

  return {
    employeeId: employee.id,
    year,
    month,
    daysInMonth: dim,
    monthlySalary,
    dailyRate: dailySalary(monthlySalary, year, month),
    salaryChangedMidMonth: ratesSeen.size > 1,
    salaryConfigured: revisions.length > 0,
    counts,
    payableDays: round2(payable),
    grossEarned,
    penaltiesTotal,
    deductionsTotal,
    additionsTotal,
    netSalary,
    isComplete: monthEnd(year, month) < today,
    days,
    penalties,
    adjustments,
  };
}

/** Holidays applicable to an employee (applies_to_all or explicitly assigned). */
export const holidaysFor = (holidays: Holiday[], employeeId: string) =>
  holidays.filter((h) => h.applies_to_all || (h.holiday_employees ?? []).some((x) => x.employee_id === employeeId));

/** What a day is, treating planned holidays / offs / approved leave as real for today and future dates. */
export const effectiveKind = (d: DayResult): DayKind => (d.kind === 'upcoming' ? d.planned ?? 'upcoming' : d.kind);
