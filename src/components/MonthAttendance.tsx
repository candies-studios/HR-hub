import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { computePayroll, loadMonthData } from '../lib/api';
import { currentYearMonth, formatDate, formatTime, minutesToHM, monthLabel, nextMonth, prevMonth } from '../lib/dates';
import { days as fmtDays } from '../lib/format';
import { useData } from '../lib/hooks';
import { DAY_KIND_LABEL, type DayResult } from '../lib/salary';
import type { Employee } from '../lib/types';
import { AttendanceCalendar, Legend } from './AttendanceCalendar';
import { AttendanceEditModal, type AttendanceTarget } from './AttendanceEditModal';
import { Alert, Badge, Button, Card, Loading, Table, Td, Th } from './ui';

export function MonthAttendance({ employee, editable = false }: { employee: Employee; editable?: boolean }) {
  const [ym, setYm] = useState(currentYearMonth());
  const [target, setTarget] = useState<AttendanceTarget | null>(null);
  const { data, loading, error, reload } = useData(async () => {
    const d = await loadMonthData(ym.year, ym.month, employee.id);
    return { result: computePayroll(d, employee), data: d };
  }, [ym.year, ym.month, employee.id]);

  useEffect(() => {
    const h = () => reload();
    window.addEventListener('attendance-updated', h);
    return () => window.removeEventListener('attendance-updated', h);
  }, [reload]);

  const r = data?.result;
  const finalized = data?.data.payroll.length ? true : false;
  const onDay = editable && !finalized
    ? (d: DayResult) => setTarget({ employeeId: employee.id, employeeName: employee.full_name, employeeCode: employee.employee_code, date: d.date, record: d.attendance ?? null })
    : undefined;

  const stats = r ? [
    ['Present', r.counts.present], ['Half days', r.counts.halfDays], ['Late arrivals', r.counts.lateArrivals],
    ['Paid leave', r.counts.paidLeave], ['Unpaid leave', r.counts.unpaidLeave], ['Holidays', r.counts.paidHolidays + r.counts.unpaidHolidays],
    ['Absent', r.counts.absent], ['Payable days', fmtDays(r.payableDays)],
  ] : [];

  const worked = r?.days.filter((d) => d.attendance) ?? [];

  return (
    <div className="space-y-5">
      <Card
        title={<div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setYm(prevMonth(ym.year, ym.month))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
          <h2 className="w-36 text-center text-sm font-semibold">{monthLabel(ym.year, ym.month)}</h2>
          <Button variant="ghost" size="sm" onClick={() => setYm(nextMonth(ym.year, ym.month))} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
        </div>}
        actions={finalized ? <Badge tone="violet">Payroll finalised – locked</Badge> : editable ? <span className="text-xs text-slate-500">Click a day to mark / edit</span> : null}
      >
        {loading ? <Loading /> : error ? <Alert tone="error">{error}</Alert> : r && (
          <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
            <div>
              <AttendanceCalendar days={r.days} onDayClick={onDay} />
              <div className="mt-4"><Legend /></div>
            </div>
            <div className="grid grid-cols-2 gap-2 self-start lg:grid-cols-1">
              {stats.map(([label, v]) => (
                <div key={label as string} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="text-slate-600">{label}</span><span className="font-semibold text-slate-900">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {r && worked.length > 0 && (
        <Card title="Daily log" bodyClassName="p-0">
          <Table>
            <thead><tr><Th>Date</Th><Th>Status</Th><Th>Sign in</Th><Th>Sign out</Th><Th>Duration</Th><Th>Notes</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {worked.map((d) => (
                <tr key={d.date}>
                  <Td>{formatDate(d.date)}</Td>
                  <Td><Badge tone={d.kind === 'present' || d.kind === 'late_excused' ? 'green' : d.kind === 'absent' ? 'red' : d.kind === 'late_half_day' ? 'orange' : 'yellow'}>{DAY_KIND_LABEL[d.kind]}</Badge></Td>
                  <Td>{formatTime(d.attendance?.sign_in_at)}</Td>
                  <Td>{d.attendance?.sign_out_at ? formatTime(d.attendance.sign_out_at) : d.attendance?.sign_in_at ? <span className="text-xs text-orange-600">not signed out</span> : '—'}</Td>
                  <Td>{minutesToHM(d.attendance?.total_minutes)}</Td>
                  <Td className="max-w-xs truncate text-xs text-slate-500">{[d.note, d.attendance?.remarks].filter(Boolean).join(' · ')}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <AttendanceEditModal target={target} onClose={() => setTarget(null)} onSaved={reload} />
    </div>
  );
}
