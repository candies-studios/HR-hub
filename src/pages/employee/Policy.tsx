import { useState } from 'react';
import { Alert, Badge, Card, EmptyState, Loading, PageHeader, Select, Table, Td, Th } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { fetchHolidays, fetchLeaveTypes } from '../../lib/api';
import { currentYearMonth, dayOfWeek, formatClock, formatDate, todayIST, WEEKDAYS } from '../../lib/dates';
import { useData } from '../../lib/hooks';
import { holidaysFor } from '../../lib/salary';
import { HOLIDAY_CATEGORIES } from '../../lib/types';

export default function Policy() {
  const { settings, employee } = useAuth();
  const [year, setYear] = useState(currentYearMonth().year);
  const { data, loading, error } = useData(async () => {
    const [types, holidays] = await Promise.all([fetchLeaveTypes(), fetchHolidays(`${year}-01-01`, `${year}-12-31`)]);
    return { types: types.filter((t) => t.is_active), holidays: employee ? holidaysFor(holidays, employee.id) : holidays };
  }, [year, employee?.id]);
  const today = todayIST();
  const offs = settings?.weekly_off_days.map((d) => WEEKDAYS[d]).join(', ') || 'None';

  return (
    <>
      <PageHeader title="Leave Policy & Holiday Calendar" />
      {loading ? <Loading /> : error ? <Alert tone="error">{error}</Alert> : data && (
        <div className="space-y-6">
          <Card title="Attendance & salary rules">
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
              <li>Office hours: login by <b>{formatClock(settings?.reporting_time)}</b>{settings?.grace_minutes ? ` (grace period ${settings.grace_minutes} min)` : ''}, logout at <b>{formatClock(settings?.office_end_time ?? '18:30')}</b> IST. Logging in to this portal records your sign-in; signing out records your sign-out.</li>
              <li>If you forget to log out, your sign-out is recorded automatically as {formatClock(settings?.office_end_time ?? '18:30')}.</li>
              <li>Sign-in at or before the reporting time = <b>Present (full day)</b>.{settings?.late_marks_half_day && <> Sign-in after it = <b>Half day</b> (half-day salary deduction), unless HR approves the late arrival as an exception.</>}</li>
              <li>Weekly off: <b>{offs}</b> – {settings?.weekly_off_paid ? 'paid' : 'unpaid'}.</li>
              <li>Daily salary = monthly salary ÷ number of calendar days in that month.</li>
              <li>Payable days = full days + (half days × 0.5) + approved paid leave + paid holidays{settings?.weekly_off_paid ? ' + weekly offs' : ''}. Unpaid leave and absences are not paid.</li>
              <li>Planned leave must be applied in advance through the portal and approved before it counts as leave.</li>
            </ul>
          </Card>
          <Card title="Leave types" bodyClassName="p-0">
            <Table>
              <thead><tr><Th>Leave type</Th><Th>Pay</Th><Th>Annual entitlement</Th><Th>Apply in advance</Th><Th>Policy</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.types.map((t) => (
                  <tr key={t.id} className="align-top">
                    <Td className="font-medium">{t.name} <span className="font-mono text-xs text-slate-400">{t.code}</span></Td>
                    <Td><Badge tone={t.is_paid ? 'green' : 'grey'}>{t.is_paid ? 'Paid' : 'Unpaid'}</Badge></Td>
                    <Td>{t.annual_quota != null ? `${t.annual_quota} days` : 'As approved'}</Td>
                    <Td>{t.min_notice_days ? `${t.min_notice_days} day(s)` : 'Same day allowed'}</Td>
                    <Td className="max-w-md whitespace-normal text-slate-600">{t.description}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card title={`Holiday calendar ${year}`} actions={
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28">
              {[currentYearMonth().year - 1, currentYearMonth().year, currentYearMonth().year + 1].map((y) => <option key={y}>{y}</option>)}
            </Select>} bodyClassName="p-0">
            {!data.holidays.length ? <EmptyState title="No holidays published for this year yet" /> : (
              <Table>
                <thead><tr><Th>Date</Th><Th>Day</Th><Th>Holiday</Th><Th>Category</Th><Th>Pay</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.holidays.map((h) => (
                    <tr key={h.id} className={h.holiday_date < today ? 'opacity-60' : ''}>
                      <Td className="font-medium">{formatDate(h.holiday_date)}</Td><Td>{WEEKDAYS[dayOfWeek(h.holiday_date)]}</Td>
                      <Td>{h.name}{h.description && <div className="text-xs text-slate-500">{h.description}</div>}</Td>
                      <Td>{HOLIDAY_CATEGORIES.find((c) => c.value === h.category)?.label}</Td>
                      <Td><Badge tone={h.is_paid ? 'green' : 'grey'}>{h.is_paid ? 'Paid' : 'Unpaid'}</Badge></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
