import { AlarmClock, CalendarCheck, CalendarPlus, CalendarX2, Clock, FileDown, LogIn, Palmtree, Wallet } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Card, EmptyState, Loading, PageHeader, StatCard, leaveStatusTone } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { computePayroll, fetchLeaveTypes, loadMonthData, snapshotOf } from '../../lib/api';
import { currentYearMonth, formatDate, formatTime, minutesToHM, monthLabel, officeHours, todayIST, WEEKDAYS, dayOfWeek } from '../../lib/dates';
import { days as fmtDays, money } from '../../lib/format';
import { useData } from '../../lib/hooks';
import { salarySlipPDF } from '../../lib/pdf';
import { effectiveKind, holidaysFor } from '../../lib/salary';
import { must, supabase } from '../../lib/supabase';
import type { Holiday, LeaveRequest, PayrollRecord } from '../../lib/types';

export default function EmployeeDashboard() {
  const { employee, settings } = useAuth();
  const { year, month } = currentYearMonth();
  const today = todayIST();

  const { data, loading, error, reload } = useData(async () => {
    if (!employee) return null;
    const [md, leaves, upcoming, slips, types] = await Promise.all([
      loadMonthData(year, month, employee.id),
      must(supabase.from('leave_requests').select('*').eq('employee_id', employee.id).order('created_at', { ascending: false }).limit(5)) as Promise<LeaveRequest[]>,
      must(supabase.from('holidays').select('*, holiday_employees(employee_id)').gte('holiday_date', today).order('holiday_date').limit(8)) as Promise<Holiday[]>,
      must(supabase.from('payroll_records').select('*').eq('employee_id', employee.id).order('year', { ascending: false }).order('month', { ascending: false }).limit(1)) as Promise<PayrollRecord[]>,
      fetchLeaveTypes(),
    ]);
    return { r: computePayroll(md, employee), leaves, upcoming: holidaysFor(upcoming, employee.id).slice(0, 5), slip: slips[0], types };
  }, [employee?.id, year, month]);

  useEffect(() => {
    const h = () => reload();
    window.addEventListener('attendance-updated', h);
    return () => window.removeEventListener('attendance-updated', h);
  }, [reload]);

  if (!employee) return null;
  const todayRec = data?.r.days.find((d) => d.date === today);
  const att = todayRec?.attendance;

  return (
    <>
      <PageHeader title={`Hello, ${employee.full_name.split(' ')[0]} 👋`} subtitle={`${WEEKDAYS[dayOfWeek(today)]}, ${formatDate(today)} · Office hours ${officeHours(settings)}`} />
      {loading ? <Loading /> : error ? <Alert tone="error">{error}</Alert> : data && (
        <>
          <Card className="mb-6">
            <div className="flex flex-wrap items-center gap-6">
              <div className={`rounded-xl p-3 ${att ? (att.status === 'present' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600') : 'bg-slate-100 text-slate-500'}`}>
                <LogIn className="h-7 w-7" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Today's attendance</p>
                {att ? (
                  <>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      Signed in at {formatTime(att.sign_in_at)}{' '}
                      {att.status === 'present' ? <Badge tone="green">{att.late_exception ? 'Full day (late – exception approved)' : 'Present – full day'}</Badge>
                        : att.status === 'half_day' ? <Badge tone="orange">Half day{att.is_late ? ` – late by ${att.late_minutes} min` : ''}</Badge>
                        : <Badge tone="red">Absent</Badge>}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {att.sign_out_at ? `Last sign-out ${formatTime(att.sign_out_at)}${att.auto_signed_out ? ' (recorded automatically – you did not log out)' : ''} · ${att.total_minutes > 0 ? `${minutesToHM(att.total_minutes)} worked` : 'under a minute worked'}` : `Your sign-out time is recorded when you click “Sign out”. Office closes at ${officeHours(settings).split(' – ')[1]}.`}
                    </p>
                    {att.is_late && !att.late_exception && <p className="mt-1 text-xs text-orange-700">Late arrivals are counted as a half day. Your manager can approve an exception.</p>}
                  </>
                ) : todayRec && ['holiday_paid', 'holiday_unpaid'].includes(effectiveKind(todayRec)) ? (
                  <p className="mt-1 text-lg font-semibold">Holiday today – {todayRec.note}</p>
                ) : todayRec && ['paid_leave', 'unpaid_leave'].includes(effectiveKind(todayRec)) ? (
                  <p className="mt-1 text-lg font-semibold">You are on approved leave today</p>
                ) : todayRec && ['weekly_off_paid', 'weekly_off_unpaid'].includes(effectiveKind(todayRec)) ? <p className="mt-1 text-lg font-semibold">Weekly off today</p>
                : <p className="mt-1 text-lg font-semibold text-slate-700">Not signed in yet</p>}
              </div>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={`Present · ${monthLabel(year, month)}`} value={data.r.counts.present} icon={<CalendarCheck className="h-5 w-5" />} tone="green" />
            <StatCard label="Half days / late" value={`${data.r.counts.halfDays} / ${data.r.counts.lateArrivals}`} icon={<AlarmClock className="h-5 w-5" />} tone="orange" />
            <StatCard label="Leave / absent" value={`${data.r.counts.paidLeave + data.r.counts.unpaidLeave} / ${data.r.counts.absent}`} icon={<CalendarX2 className="h-5 w-5" />} tone="red" />
            <StatCard label="Earned so far" value={money(data.r.netSalary)} hint={`${fmtDays(data.r.payableDays)} payable days to date`} icon={<Wallet className="h-5 w-5" />} tone="violet" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card title="Recent leave applications" actions={<Link to="/app/leaves"><Button size="sm" icon={<CalendarPlus className="h-3.5 w-3.5" />}>Apply leave</Button></Link>}>
              {!data.leaves.length ? <EmptyState title="No leave applications yet" /> : (
                <ul className="divide-y divide-slate-100">
                  {data.leaves.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <div><p className="font-medium">{data.types.find((t) => t.id === l.leave_type_id)?.name}</p><p className="text-xs text-slate-500">{formatDate(l.start_date)} – {formatDate(l.end_date)} · {l.days} day(s)</p></div>
                      <Badge tone={leaveStatusTone(l.status)}>{l.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Upcoming holidays" actions={<Link to="/app/policy" className="text-xs font-medium text-brand-600 hover:underline">Full calendar</Link>}>
              {!data.upcoming.length ? <EmptyState icon={<Palmtree className="h-5 w-5" />} title="No upcoming holidays" /> : (
                <ul className="divide-y divide-slate-100">
                  {data.upcoming.map((h) => (
                    <li key={h.id} className="flex items-center justify-between py-2 text-sm">
                      <div><p className="font-medium">{h.name}</p><p className="text-xs text-slate-500">{WEEKDAYS[dayOfWeek(h.holiday_date)]}, {formatDate(h.holiday_date)}</p></div>
                      <Badge tone={h.is_paid ? 'green' : 'grey'}>{h.is_paid ? 'paid' : 'unpaid'}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Latest salary slip">
              {!data.slip ? <EmptyState icon={<Clock className="h-5 w-5" />} title="No salary slip issued yet" /> : (
                <div>
                  <p className="text-sm text-slate-500">{monthLabel(data.slip.year, data.slip.month)}</p>
                  <p className="mt-1 text-2xl font-semibold">{money(data.slip.net_salary)}</p>
                  <p className="text-xs text-slate-500">{data.slip.payable_days} payable days</p>
                  <Button className="mt-4" variant="secondary" icon={<FileDown className="h-4 w-4" />} onClick={() => settings && salarySlipPDF(
                    [{ employee, result: snapshotOf(data.slip!), settings, finalizedAt: data.slip!.finalized_at }],
                    `salary-slip-${employee.employee_code}-${data.slip!.year}-${String(data.slip!.month).padStart(2, '0')}.pdf`)}>Download PDF</Button>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
