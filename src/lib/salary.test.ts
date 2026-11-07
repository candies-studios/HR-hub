import { describe, expect, it } from 'vitest';
import { calculatePayroll, dailySalary, effectiveKind, salaryOn, type PayrollInput } from './salary';
import { daysInMonth, monthDates } from './dates';
import type { Attendance, LeaveType, SalaryRevision } from './types';

const rev = (monthly: number, effective: string): SalaryRevision => ({
  id: effective, employee_id: 'e1', monthly_salary: monthly, effective_date: effective, reason: null, created_at: '',
});
const att = (date: string, status: Attendance['status'], extra: Partial<Attendance> = {}): Attendance => ({
  id: date, employee_id: 'e1', work_date: date, status, sign_in_at: null, sign_out_at: null, total_minutes: 0,
  is_late: false, late_minutes: 0, late_exception: false, late_exception_reason: null, late_exception_at: null,
  source: 'portal', remarks: null, created_at: '', updated_at: '', ...extra,
});
const CL: LeaveType = { id: 'cl', code: 'CL', name: 'Casual', is_paid: true, annual_quota: 12, min_notice_days: 1, description: null, is_active: true, sort_order: 1 };
const LWP: LeaveType = { ...CL, id: 'lwp', code: 'LWP', name: 'LWP', is_paid: false, annual_quota: null };

const base = (over: Partial<PayrollInput> = {}): PayrollInput => ({
  employee: { id: 'e1', date_of_joining: '2020-01-01', inactive_from: null },
  year: 2026, month: 3, today: '2030-01-01',
  settings: { weekly_off_days: [], weekly_off_paid: true },
  revisions: [rev(30000, '2020-01-01')],
  attendance: [], leaves: [], leaveTypes: [CL, LWP], holidays: [], penalties: [], adjustments: [],
  ...over,
});
const allPresent = (y: number, m: number) => monthDates(y, m).map((d) => att(d, 'present'));

describe('daily salary', () => {
  it('matches the specification examples', () => {
    expect(dailySalary(30000, 2026, 2)).toBe(1071.43); // 28 days
    expect(dailySalary(30000, 2026, 4)).toBe(1000);    // 30 days
    expect(dailySalary(30000, 2026, 3)).toBe(967.74);  // 31 days
  });
  it('handles leap years', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(dailySalary(29000, 2028, 2)).toBe(1000);
  });
});

describe('payroll', () => {
  it('full attendance earns exactly the monthly salary (no rounding drift)', () => {
    for (const m of [1, 2, 3, 4]) {
      const r = calculatePayroll(base({ month: m, attendance: allPresent(2026, m) }));
      expect(r.grossEarned).toBe(30000);
      expect(r.netSalary).toBe(30000);
    }
  });

  it('applies half day, paid & unpaid leave, penalties and adjustments once each', () => {
    const a = allPresent(2026, 4).filter((x) => !['2026-04-10', '2026-04-20', '2026-04-21', '2026-04-22'].includes(x.work_date));
    a.push(att('2026-04-10', 'half_day', { is_late: true, late_minutes: 15 }));
    const r = calculatePayroll(base({
      month: 4,
      attendance: a,
      leaves: [
        { id: 'l1', employee_id: 'e1', leave_type_id: 'cl', start_date: '2026-04-20', end_date: '2026-04-20', days: 1, reason: 'x', attachment_path: null, status: 'approved', admin_comment: null, reviewed_at: null, created_at: '' },
        { id: 'l2', employee_id: 'e1', leave_type_id: 'lwp', start_date: '2026-04-21', end_date: '2026-04-21', days: 1, reason: 'x', attachment_path: null, status: 'approved', admin_comment: null, reviewed_at: null, created_at: '' },
      ],
      penalties: [{ id: 'p', employee_id: 'e1', penalty_date: '2026-04-05', category: 'other', penalty_type: 'financial', reason: 'x', amount: 500, deduction_year: 2026, deduction_month: 4, status: 'active', waived_reason: null, notes: null, created_at: '' }],
      adjustments: [{ id: 'a', employee_id: 'e1', year: 2026, month: 4, adj_type: 'addition', amount: 250, reason: 'bonus', created_at: '' }],
    }));
    // 30 days: 26 present + 0.5 half + 1 paid leave; 1 unpaid leave; 1 absent (22nd)
    expect(r.counts.present).toBe(26);
    expect(r.counts.halfDays).toBe(1);
    expect(r.counts.lateArrivals).toBe(1);
    expect(r.counts.paidLeave).toBe(1);
    expect(r.counts.unpaidLeave).toBe(1);
    expect(r.counts.absent).toBe(1);
    expect(r.payableDays).toBe(27.5);
    expect(r.grossEarned).toBe(27500);
    expect(r.netSalary).toBe(27250);
  });

  it('late arrival approved as exception is a full day', () => {
    const a = allPresent(2026, 4);
    a[4] = att(a[4].work_date, 'present', { is_late: true, late_exception: true });
    const r = calculatePayroll(base({ month: 4, attendance: a }));
    expect(r.grossEarned).toBe(30000);
    expect(r.counts.lateExcused).toBe(1);
  });

  it('respects weekly-off and holiday configuration', () => {
    const april = monthDates(2026, 4);
    const sundays = april.filter((d) => new Date(d + 'T00:00:00Z').getUTCDay() === 0);
    const a = april.filter((d) => !sundays.includes(d) && d !== '2026-04-14').map((d) => att(d, 'present'));
    const holidays = [{ id: 'h', name: 'Ambedkar Jayanti', holiday_date: '2026-04-14', category: 'national' as const, is_paid: true, applies_to_all: true, description: null }];
    const paid = calculatePayroll(base({ month: 4, attendance: a, holidays, settings: { weekly_off_days: [0], weekly_off_paid: true } }));
    expect(paid.grossEarned).toBe(30000);
    const unpaid = calculatePayroll(base({ month: 4, attendance: a, holidays, settings: { weekly_off_days: [0], weekly_off_paid: false } }));
    expect(unpaid.payableDays).toBe(30 - sundays.length);
  });

  it('pro-rates mid-month joiners and mid-month salary revisions', () => {
    const r = calculatePayroll(base({
      month: 4,
      employee: { id: 'e1', date_of_joining: '2026-04-16', inactive_from: null },
      revisions: [rev(30000, '2026-04-16')],
      attendance: allPresent(2026, 4).filter((x) => x.work_date >= '2026-04-16'),
    }));
    expect(r.payableDays).toBe(15);
    expect(r.grossEarned).toBe(15000);

    const r2 = calculatePayroll(base({ month: 4, revisions: [rev(30000, '2020-01-01'), rev(36000, '2026-04-16')], attendance: allPresent(2026, 4) }));
    expect(r2.grossEarned).toBe(33000);
    expect(r2.salaryChangedMidMonth).toBe(true);
    expect(salaryOn(r2.days.length ? [rev(30000, '2020-01-01'), rev(36000, '2026-04-16')] : [], '2026-04-15')).toBe(30000);
  });

  it('does not count future days as absent', () => {
    const r = calculatePayroll(base({ month: 4, today: '2026-04-10', attendance: allPresent(2026, 4).filter((x) => x.work_date < '2026-04-10') }));
    expect(r.counts.absent).toBe(0);
    expect(r.counts.upcoming).toBe(21);
    expect(r.isComplete).toBe(false);
  });

  it('shows planned holidays and leave for future days without paying them yet', () => {
    const r = calculatePayroll(base({
      month: 11, today: '2026-11-07', attendance: [],
      settings: { weekly_off_days: [0], weekly_off_paid: true },
      holidays: [{ id: 'h', name: 'Diwali', holiday_date: '2026-11-08', category: 'festival', is_paid: true, applies_to_all: true, description: null }],
      leaves: [{ id: 'l', employee_id: 'e1', leave_type_id: 'cl', start_date: '2026-11-16', end_date: '2026-11-18', days: 3, reason: 'x', attachment_path: null, status: 'approved', admin_comment: null, reviewed_at: null, created_at: '' }],
    }));
    const day = (d: string) => r.days.find((x) => x.date === d)!;
    expect(day('2026-11-08').kind).toBe('upcoming');
    expect(effectiveKind(day('2026-11-08'))).toBe('holiday_paid');
    expect(effectiveKind(day('2026-11-17'))).toBe('paid_leave');
    expect(effectiveKind(day('2026-11-10'))).toBe('upcoming');
    expect(r.counts.paidLeave).toBe(0);
    expect(r.counts.paidHolidays).toBe(0);
    expect(r.payableDays).toBe(1); // only Sunday 1 Nov (paid weekly off) has elapsed with pay
  });
});
