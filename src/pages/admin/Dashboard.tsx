import {
  AlarmClock, CalendarCheck, CalendarPlus, CalendarX2, ClipboardList, Download, FileText, Gavel, Palmtree, PieChart as PieIcon,
  SunMedium, UserPlus, Users, Wallet,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Alert, Badge, Button, Card, EmptyState, Loading, PageHeader, StatCard } from '../../components/ui';
import { computeAll, employedInMonth, fetchAll, loadRangeData, snapshotOf, withMonth } from '../../lib/api';
import { effectiveKind } from '../../lib/salary';
import { currentYearMonth, formatDate, formatTime, lastMonths, monthEnd, monthLabel, monthStart, shortMonthLabel, todayIST } from '../../lib/dates';
import { money, moneyShort } from '../../lib/format';
import { useData } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import type { LeaveRequest } from '../../lib/types';

const C = { present: '#10b981', half: '#facc15', absent: '#ef4444', leave: '#0ea5e9', late: '#f97316', brand: '#1f45eb', grid: '#e2e8f0', axis: '#64748b' };

const pieData = (d: { presentToday: unknown[]; halfToday: unknown[]; onLeave: unknown[]; absentToday: number }) => [
  { name: 'Present', value: d.presentToday.length - d.halfToday.length, color: C.present },
  { name: 'Half day', value: d.halfToday.length, color: C.half },
  { name: 'On leave', value: d.onLeave.length, color: C.leave },
  { name: 'Absent / not signed in', value: Math.max(0, d.absentToday), color: C.absent },
].filter((x) => x.value > 0);

export default function AdminDashboard() {
  const navigate = useNavigate();
  const today = todayIST();
  const { year, month } = currentYearMonth();

  const { data, loading, error } = useData(async () => {
    const months = lastMonths(year, month, 6);
    const base = await loadRangeData(monthStart(months[0].year, months[0].month), monthEnd(year, month));
    const pending = await fetchAll<LeaveRequest>((f, t) => supabase.from('leave_requests').select('*').eq('status', 'pending').order('start_date').range(f, t));

    const perMonth = months.map(({ year: y, month: m }) => {
      const d = withMonth(base, y, m);
      const results = computeAll(d);
      let present = 0, half = 0, absent = 0, leave = 0, late = 0, net = 0;
      for (const [empId, r] of results) {
        present += r.counts.present; half += r.counts.halfDays; absent += r.counts.absent;
        leave += r.counts.paidLeave + r.counts.unpaidLeave; late += r.counts.lateArrivals;
        const rec = d.payroll.find((p) => p.employee_id === empId);
        net += rec ? Number(rec.net_salary) : r.netSalary;
      }
      const finalized = d.payroll.length > 0 && d.payroll.length >= results.size;
      return { label: shortMonthLabel(y, m), y, m, present, half, absent, leave, late, net: Math.round(net), finalized, results, d };
    });

    const cur = perMonth[perMonth.length - 1];
    const active = base.employees.filter((e) => e.status === 'active');
    const todayRows = employedInMonth(base.employees, year, month)
      .filter((e) => e.date_of_joining <= today && (!e.inactive_from || e.inactive_from >= today))
      .map((e) => { const day = cur.results.get(e.id)?.days.find((x) => x.date === today); return { e, day, kind: day ? effectiveKind(day) : undefined }; });
    const presentToday = todayRows.filter((r) => r.day?.attendance && r.day.attendance.status !== 'absent');
    const onLeave = todayRows.filter((r) => !r.day?.attendance && (r.kind === 'paid_leave' || r.kind === 'unpaid_leave'));
    const offToday = todayRows.filter((r) => !r.day?.attendance && r.kind && ['holiday_paid', 'holiday_unpaid', 'weekly_off_paid', 'weekly_off_unpaid'].includes(r.kind));
    const lateToday = todayRows.filter((r) => r.day?.attendance?.is_late);
    const halfToday = todayRows.filter((r) => r.day?.attendance?.status === 'half_day');
    const absentToday = todayRows.length - presentToday.length - onLeave.length - offToday.length;
    const penalties = cur.d.penalties.filter((p) => p.status === 'active' && p.penalty_type === 'financial' && p.deduction_year === year && p.deduction_month === month);
    const payrollNet = [...cur.results.entries()].reduce((s, [id, r]) => {
      const rec = cur.d.payroll.find((p) => p.employee_id === id);
      return s + (rec ? snapshotOf(rec).netSalary : r.netSalary);
    }, 0);

    return {
      perMonth, active: active.length, presentToday, onLeave, lateToday, halfToday, absentToday, offToday: offToday.length,
      penaltyTotal: penalties.reduce((s, p) => s + Number(p.amount), 0), penaltyCount: penalties.length, payrollNet,
      pending, emps: new Map(base.employees.map((e) => [e.id, e])),
    };
  }, [year, month]);

  const actions = [
    { label: 'Add Employee', icon: UserPlus, to: '/admin/employees/new' },
    { label: 'Mark Attendance', icon: CalendarCheck, to: '/admin/attendance' },
    { label: 'Manage Leaves', icon: ClipboardList, to: '/admin/leaves' },
    { label: 'Manage Holidays', icon: Palmtree, to: '/admin/holidays' },
    { label: 'Add Penalty', icon: Gavel, to: '/admin/penalties' },
    { label: 'Generate Salary Slips', icon: FileText, to: '/admin/payroll' },
    { label: 'Export Reports', icon: Download, to: '/admin/reports' },
  ];

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`${formatDate(today)} · all times in IST`} />
      <div className="mb-6 flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button key={a.label} variant="secondary" icon={<a.icon className="h-4 w-4 text-brand-600" />} onClick={() => navigate(a.to)}>{a.label}</Button>
        ))}
      </div>

      {loading ? <Loading label="Loading dashboard…" /> : error ? <Alert tone="error">{error}</Alert> : data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total employees" value={data.active} hint="active" icon={<Users className="h-5 w-5" />} onClick={() => navigate('/admin/employees')} />
            <StatCard label="Present today" value={data.presentToday.length} icon={<CalendarCheck className="h-5 w-5" />} tone="green" onClick={() => navigate('/admin/attendance')} />
            <StatCard label="Absent today" value={Math.max(0, data.absentToday)} hint={data.offToday ? `${data.offToday} on holiday / weekly off` : 'incl. not yet signed in'} icon={<CalendarX2 className="h-5 w-5" />} tone="red" onClick={() => navigate('/admin/attendance')} />
            <StatCard label="On leave today" value={data.onLeave.length} icon={<SunMedium className="h-5 w-5" />} tone="blue" onClick={() => navigate('/admin/leaves')} />
            <StatCard label="Late arrivals today" value={data.lateToday.length} icon={<AlarmClock className="h-5 w-5" />} tone="orange" />
            <StatCard label="Half days today" value={data.halfToday.length} icon={<PieIcon className="h-5 w-5" />} tone="amber" />
            <StatCard label={`Payroll · ${monthLabel(year, month)}`} value={moneyShort(data.payrollNet)} hint="net, to date" icon={<Wallet className="h-5 w-5" />} tone="violet" onClick={() => navigate('/admin/payroll')} />
            <StatCard label="Penalties this month" value={money(data.penaltyTotal)} hint={`${data.penaltyCount} active`} icon={<Gavel className="h-5 w-5" />} tone="slate" onClick={() => navigate('/admin/penalties')} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card title="Monthly attendance trend (employee-days)" className="lg:col-span-2">
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={data.perMonth} margin={{ left: -10 }}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: C.axis }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: C.axis }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: '#f1f5f9' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="present" name="Present" stackId="a" fill={C.present} />
                    <Bar dataKey="half" name="Half day" stackId="a" fill={C.half} />
                    <Bar dataKey="leave" name="Leave" stackId="a" fill={C.leave} />
                    <Bar dataKey="absent" name="Absent" stackId="a" fill={C.absent} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Present vs absent · today">
              {data.presentToday.length + data.absentToday + data.onLeave.length === 0 ? <EmptyState title="No working employees today" /> : (
                <div className="h-72">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} data={pieData(data)}>
                        {pieData(data).map((x) => <Cell key={x.name} fill={x.color} />)}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
            <Card title="Half days & late arrivals">
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={data.perMonth} margin={{ left: -20 }}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: C.axis }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: C.axis }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="half" name="Half days" stroke="#ca8a04" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="late" name="Late arrivals" stroke={C.late} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Monthly salary expenditure (net)" className="lg:col-span-2">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={data.perMonth} margin={{ left: 10 }}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: C.axis }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => moneyShort(v)} tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: number) => money(v)} cursor={{ fill: '#f1f5f9' }} />
                    <Bar dataKey="net" name="Net salary" radius={[4, 4, 0, 0]}>
                      {data.perMonth.map((m) => <Cell key={m.label} fill={m.finalized ? C.brand : '#93b4ff'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-slate-500">Dark bars: finalised payroll. Light bars: live calculation (draft / month in progress).</p>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card title={`Pending leave requests (${data.pending.length})`} actions={<Button size="sm" variant="ghost" onClick={() => navigate('/admin/leaves')}>View all</Button>}>
              {!data.pending.length ? <EmptyState icon={<CalendarPlus className="h-5 w-5" />} title="Nothing to approve" /> : (
                <ul className="divide-y divide-slate-100">
                  {data.pending.slice(0, 6).map((l) => {
                    const e = data.emps.get(l.employee_id);
                    return (
                      <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <div><p className="font-medium">{e?.full_name} <span className="font-mono text-xs text-slate-500">{e?.employee_code}</span></p>
                          <p className="text-xs text-slate-500">{formatDate(l.start_date)} – {formatDate(l.end_date)} · {l.days} day(s)</p></div>
                        <Badge tone="yellow">pending</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            <Card title={`Late arrivals today (${data.lateToday.length})`}>
              {!data.lateToday.length ? <EmptyState icon={<AlarmClock className="h-5 w-5" />} title="No late arrivals today" /> : (
                <ul className="divide-y divide-slate-100">
                  {data.lateToday.map(({ e, day }) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div><p className="font-medium">{e.full_name} <span className="font-mono text-xs text-slate-500">{e.employee_code}</span></p>
                        <p className="text-xs text-slate-500">Signed in {formatTime(day?.attendance?.sign_in_at)} · {day?.attendance?.late_minutes} min late</p></div>
                      {day?.attendance?.late_exception ? <Badge tone="green">exception</Badge> : <Badge tone="orange">half day</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
