import { FileDown } from 'lucide-react';
import { Alert, Badge, Button, Card, EmptyState, Loading, PageHeader, Table, Td, Th } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { computePayroll, loadMonthData, snapshotOf } from '../../lib/api';
import { currentYearMonth, formatDate, monthLabel } from '../../lib/dates';
import { days as fmtDays, money } from '../../lib/format';
import { useData } from '../../lib/hooks';
import { salarySlipPDF } from '../../lib/pdf';
import { must, supabase } from '../../lib/supabase';
import { PENALTY_CATEGORIES, type PayrollRecord, type Penalty, type SalaryRevision } from '../../lib/types';

export default function MySalary() {
  const { employee, settings } = useAuth();
  const { year, month } = currentYearMonth();
  const { data, loading, error } = useData(async () => {
    const [md, slips, penalties, revisions] = await Promise.all([
      loadMonthData(year, month, employee!.id),
      must(supabase.from('payroll_records').select('*').eq('employee_id', employee!.id).order('year', { ascending: false }).order('month', { ascending: false })) as Promise<PayrollRecord[]>,
      must(supabase.from('penalties').select('*').eq('employee_id', employee!.id).order('penalty_date', { ascending: false })) as Promise<Penalty[]>,
      must(supabase.from('salary_revisions').select('*').eq('employee_id', employee!.id).order('effective_date', { ascending: false })) as Promise<SalaryRevision[]>,
    ]);
    return { live: computePayroll(md, employee!), slips, penalties, revisions, finalized: md.payroll[0] };
  }, [employee?.id, year, month]);

  if (!employee) return null;
  const download = (p: PayrollRecord) => settings && salarySlipPDF(
    [{ employee, result: snapshotOf(p), settings, finalizedAt: p.finalized_at }],
    `salary-slip-${employee.employee_code}-${p.year}-${String(p.month).padStart(2, '0')}.pdf`);

  return (
    <>
      <PageHeader title="Salary & Salary Slips" />
      {loading ? <Loading /> : error ? <Alert tone="error">{error}</Alert> : data && (() => {
        const r = data.finalized ? snapshotOf(data.finalized) : data.live;
        const c = r.counts;
        return (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title={`${monthLabel(year, month)} ${data.finalized ? '' : '(to date, estimate)'}`} actions={data.finalized ? <Badge tone="violet">finalised</Badge> : <Badge tone="yellow">in progress</Badge>}>
              <dl className="divide-y divide-slate-100 text-sm">
                {([
                  ['Monthly salary', money(r.monthlySalary)],
                  ['Daily salary', `${money(r.monthlySalary)} ÷ ${r.daysInMonth} days = ${money(r.dailyRate)}`],
                  ['Full present days', c.present], ['Half days (× 0.5)', c.halfDays], ['Late arrivals', `${c.lateArrivals}${c.lateExcused ? ` (${c.lateExcused} excused)` : ''}`],
                  ['Approved paid leave', c.paidLeave], ['Unpaid leave', c.unpaidLeave], ['Paid holidays', c.paidHolidays], ['Paid weekly offs', c.weeklyOffsPaid], ['Absent', c.absent],
                  ['Payable days', fmtDays(r.payableDays)], ['Earned salary', money(r.grossEarned)],
                  ['Penalties', `− ${money(r.penaltiesTotal)}`], ['Other deductions', `− ${money(r.deductionsTotal)}`], ['Additions', `+ ${money(r.additionsTotal)}`],
                ] as [string, string | number][]).map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2"><dt className="text-slate-600">{k}</dt><dd className="font-medium text-slate-900">{v}</dd></div>
                ))}
                <div className="flex justify-between py-3 text-base font-semibold"><dt>Net salary</dt><dd className="text-brand-700">{money(r.netSalary)}</dd></div>
              </dl>
              {!data.finalized && <p className="text-xs text-slate-500">This is a running estimate. Remaining days of the month are not yet counted; the final figure appears on your salary slip.</p>}
            </Card>
            <div className="space-y-6">
              <Card title="Salary slips" bodyClassName="p-0">
                {!data.slips.length ? <EmptyState title="No salary slips issued yet" /> : (
                  <Table>
                    <thead><tr><Th>Month</Th><Th>Payable days</Th><Th className="text-right">Net salary</Th><Th /></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.slips.map((p) => (
                        <tr key={p.id}><Td>{monthLabel(p.year, p.month)}</Td><Td>{p.payable_days}</Td><Td className="text-right font-semibold">{money(p.net_salary)}</Td>
                          <Td className="text-right"><Button size="sm" variant="secondary" icon={<FileDown className="h-3.5 w-3.5" />} onClick={() => download(p)}>PDF</Button></Td></tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
              <Card title="Penalties" bodyClassName="p-0">
                {!data.penalties.length ? <EmptyState title="No penalties" /> : (
                  <Table>
                    <thead><tr><Th>Date</Th><Th>Reason</Th><Th className="text-right">Amount</Th><Th>Status</Th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.penalties.map((p) => (
                        <tr key={p.id} className="align-top"><Td>{formatDate(p.penalty_date)}</Td>
                          <Td className="max-w-xs whitespace-normal"><span className="text-xs text-slate-500">{PENALTY_CATEGORIES.find((x) => x.value === p.category)?.label}</span><br />{p.reason}</Td>
                          <Td className="text-right">{p.penalty_type === 'warning' ? <Badge tone="yellow">warning</Badge> : money(p.amount)}</Td>
                          <Td><Badge tone={p.status === 'active' ? 'red' : 'grey'}>{p.status}</Badge><div className="text-[10px] text-slate-400">{monthLabel(p.deduction_year, p.deduction_month)}</div></Td></tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
              <Card title="Salary history" bodyClassName="p-0">
                <Table>
                  <thead><tr><Th>Effective from</Th><Th className="text-right">Monthly salary</Th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.revisions.map((s) => <tr key={s.id}><Td>{formatDate(s.effective_date)}</Td><Td className="text-right">{money(s.monthly_salary)}</Td></tr>)}
                  </tbody>
                </Table>
              </Card>
            </div>
          </div>
        );
      })()}
    </>
  );
}
