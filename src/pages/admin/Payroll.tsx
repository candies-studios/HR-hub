import { Calculator, Download, FileDown, FileText, Lock, LockOpen, Plus, Trash2, Users, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useToast } from '../../components/Toast';
import {
  Alert, Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, MonthPicker, PageHeader, Select, StatCard, Table, Td, Textarea, Th,
} from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { computeAll, employedInMonth, loadMonthData, snapshotOf } from '../../lib/api';
import { currentYearMonth, formatDate, formatDateTime, monthLabel, WEEKDAYS, dayOfWeek } from '../../lib/dates';
import { downloadCSV } from '../../lib/export';
import { days as fmtDays, money } from '../../lib/format';
import { useData } from '../../lib/hooks';
import { salarySlipPDF, tablePDF } from '../../lib/pdf';
import { DAY_KIND_LABEL, type PayrollResult } from '../../lib/salary';
import { errMsg, must, supabase } from '../../lib/supabase';
import { PENALTY_CATEGORIES, type Employee, type PayrollRecord } from '../../lib/types';

interface Row { emp: Employee; live: PayrollResult; record?: PayrollRecord; shown: PayrollResult }

export default function PayrollPage() {
  const toast = useToast();
  const { settings } = useAuth();
  const [ym, setYm] = useState(() => currentYearMonth());
  const [detail, setDetail] = useState<Row | null>(null);
  const [unlock, setUnlock] = useState<Row | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const { data, loading, error, reload } = useData(async () => {
    const d = await loadMonthData(ym.year, ym.month);
    return { d, results: computeAll(d) };
  }, [ym.year, ym.month]);

  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    return employedInMonth(data.d.employees, ym.year, ym.month).map((emp) => {
      const live = data.results.get(emp.id)!;
      const record = data.d.payroll.find((p) => p.employee_id === emp.id);
      return { emp, live, record, shown: record ? snapshotOf(record) : live };
    });
  }, [data, ym]);

  const totals = rows.reduce((t, r) => ({
    gross: t.gross + r.shown.grossEarned, pen: t.pen + r.shown.penaltiesTotal + r.shown.deductionsTotal,
    add: t.add + r.shown.additionsTotal, net: t.net + r.shown.netSalary,
  }), { gross: 0, pen: 0, add: 0, net: 0 });
  const finalizedCount = rows.filter((r) => r.record).length;
  const drafts = rows.filter((r) => !r.record);
  const monthComplete = rows[0]?.live.isComplete ?? false;
  const fileStem = `${ym.year}-${String(ym.month).padStart(2, '0')}`;

  const finalize = async (list: Row[]) => {
    setBusy('finalize');
    let ok = 0; const errs: string[] = [];
    for (const r of list) {
      const calc = { ...r.live, days: r.live.days.map(({ attendance: _a, ...d }) => d) };
      const { error: e } = await supabase.from('payroll_records').insert({
        employee_id: r.emp.id, year: ym.year, month: ym.month, payable_days: r.live.payableDays, gross_earned: r.live.grossEarned,
        total_penalties: r.live.penaltiesTotal, total_deductions: r.live.deductionsTotal, total_additions: r.live.additionsTotal,
        net_salary: r.live.netSalary, calc,
      });
      if (e) errs.push(`${r.emp.employee_code}: ${errMsg(e)}`); else ok++;
    }
    setBusy(null);
    setConfirmAll(false);
    if (errs.length) toast(errs.join('; '), 'error'); else toast(`Payroll finalised for ${ok} employee(s)`);
    reload();
  };

  const slips = (list: Row[]) => {
    if (!settings || !list.length) return;
    salarySlipPDF(list.map((r) => ({ employee: r.emp, result: r.shown, settings, finalizedAt: r.record?.finalized_at })),
      list.length === 1 ? `salary-slip-${list[0].emp.employee_code}-${fileStem}.pdf` : `salary-slips-${fileStem}.pdf`);
  };

  const exportCsv = () => downloadCSV(`payroll-${fileStem}.csv`,
    ['Employee ID', 'Name', 'Designation', 'Monthly salary', 'Days in month', 'Daily salary', 'Present', 'Half days', 'Late arrivals', 'Paid leave', 'Unpaid leave', 'Paid holidays', 'Weekly offs (paid)', 'Absent', 'Payable days', 'Earned salary', 'Penalties', 'Other deductions', 'Additions', 'Net salary', 'Status'],
    rows.map(({ emp, shown: s, record }) => [emp.employee_code, emp.full_name, emp.designation, s.monthlySalary, s.daysInMonth, s.dailyRate,
      s.counts.present, s.counts.halfDays, s.counts.lateArrivals, s.counts.paidLeave, s.counts.unpaidLeave, s.counts.paidHolidays, s.counts.weeklyOffsPaid,
      s.counts.absent, s.payableDays, s.grossEarned, s.penaltiesTotal, s.deductionsTotal, s.additionsTotal, s.netSalary, record ? 'Finalised' : 'Draft']));

  const exportPdf = () => tablePDF({
    title: `Payroll register – ${monthLabel(ym.year, ym.month)}`, landscape: true, filename: `payroll-register-${fileStem}.pdf`,
    head: ['ID', 'Name', 'Monthly', 'Daily', 'Present', 'Half', 'Paid lv', 'Unpaid lv', 'Absent', 'Payable', 'Earned', 'Penalties', 'Deduct.', 'Add.', 'Net', 'Status'],
    body: [
      ...rows.map(({ emp, shown: s, record }) => [emp.employee_code, emp.full_name, s.monthlySalary.toFixed(2), s.dailyRate.toFixed(2), s.counts.present, s.counts.halfDays,
        s.counts.paidLeave, s.counts.unpaidLeave, s.counts.absent, fmtDays(s.payableDays), s.grossEarned.toFixed(2), s.penaltiesTotal.toFixed(2),
        s.deductionsTotal.toFixed(2), s.additionsTotal.toFixed(2), s.netSalary.toFixed(2), record ? 'Final' : 'Draft']),
      ['', 'TOTAL', '', '', '', '', '', '', '', '', totals.gross.toFixed(2), '', totals.pen.toFixed(2), totals.add.toFixed(2), totals.net.toFixed(2), ''],
    ],
  });

  return (
    <>
      <PageHeader title="Payroll & Salary Slips" subtitle="Daily salary = monthly salary ÷ calendar days. Payable days = full days + ½ × half days + paid leave (+ paid holidays / weekly offs)."
        actions={<MonthPicker year={ym.year} month={ym.month} onChange={(year, month) => setYm({ year, month })} />} />

      {loading ? <Loading label="Calculating salaries…" /> : error ? <Alert tone="error">{error}</Alert> : (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Employees" value={rows.length} hint={`${finalizedCount} finalised · ${drafts.length} draft`} icon={<Users className="h-5 w-5" />} />
            <StatCard label="Earned salary" value={money(totals.gross)} icon={<Calculator className="h-5 w-5" />} tone="blue" />
            <StatCard label="Penalties & deductions" value={money(totals.pen)} hint={totals.add ? `+ ${money(totals.add)} additions` : undefined} icon={<FileText className="h-5 w-5" />} tone="red" />
            <StatCard label="Net payroll" value={money(totals.net)} icon={<Wallet className="h-5 w-5" />} tone="green" />
          </div>

          {!monthComplete && <Alert tone="warn" className="mb-4">{monthLabel(ym.year, ym.month)} is still in progress – figures are calculated up to today. Days after today are not counted yet. Finalise after the month ends.</Alert>}

          <Card bodyClassName="p-0" title={`Salary calculation · ${monthLabel(ym.year, ym.month)} (${rows[0]?.live.daysInMonth ?? '–'} days)`}
            actions={<>
              <Button size="sm" variant="secondary" icon={<Download className="h-3.5 w-3.5" />} onClick={exportCsv} disabled={!rows.length}>CSV</Button>
              <Button size="sm" variant="secondary" icon={<FileDown className="h-3.5 w-3.5" />} onClick={exportPdf} disabled={!rows.length}>Register PDF</Button>
              <Button size="sm" variant="secondary" icon={<FileText className="h-3.5 w-3.5" />} onClick={() => slips(rows)} disabled={!rows.length}>All salary slips</Button>
              <Button size="sm" icon={<Lock className="h-3.5 w-3.5" />} onClick={() => setConfirmAll(true)} disabled={!drafts.length}>Finalise {drafts.length ? `(${drafts.length})` : ''}</Button>
            </>}>
            {!rows.length ? <EmptyState title="No employees on the rolls this month" /> : (
              <Table>
                <thead><tr>
                  <Th>Employee</Th><Th className="text-right">Monthly / Daily</Th><Th className="text-center">Present</Th><Th className="text-center">Half</Th>
                  <Th className="text-center">Leave P/U</Th><Th className="text-center">Absent</Th><Th className="text-center">Payable</Th>
                  <Th className="text-right">Earned</Th><Th className="text-right">Deductions</Th><Th className="text-right">Net salary</Th><Th>Status</Th><Th />
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const s = r.shown;
                    return (
                      <tr key={r.emp.id} className="hover:bg-slate-50">
                        <Td><button className="text-left" onClick={() => setDetail(r)}><div className="font-medium text-brand-700 hover:underline">{r.emp.full_name}</div><div className="font-mono text-xs text-slate-500">{r.emp.employee_code}</div></button></Td>
                        <Td className="text-right"><div>{money(s.monthlySalary)}</div><div className="text-xs text-slate-500">{money(s.dailyRate)}/day{s.salaryChangedMidMonth && ' · revised'}</div></Td>
                        <Td className="text-center">{s.counts.present}</Td>
                        <Td className="text-center">{s.counts.halfDays}{s.counts.lateArrivals > 0 && <div className="text-[10px] text-orange-600">{s.counts.lateArrivals} late</div>}</Td>
                        <Td className="text-center">{s.counts.paidLeave}/{s.counts.unpaidLeave}</Td>
                        <Td className="text-center text-red-600">{s.counts.absent}</Td>
                        <Td className="text-center font-semibold">{fmtDays(s.payableDays)}</Td>
                        <Td className="text-right">{money(s.grossEarned)}</Td>
                        <Td className="text-right text-red-600">{s.penaltiesTotal + s.deductionsTotal ? `− ${money(s.penaltiesTotal + s.deductionsTotal)}` : '—'}{s.additionsTotal > 0 && <div className="text-xs text-emerald-600">+ {money(s.additionsTotal)}</div>}</Td>
                        <Td className="text-right font-semibold text-slate-900">{money(s.netSalary)}</Td>
                        <Td>
                          {r.record ? <Badge tone="violet">finalised</Badge> : <Badge tone="yellow">draft</Badge>}
                          {!r.live.salaryConfigured && <div><Badge tone="red">no salary</Badge></div>}
                          {r.record && Math.abs(r.record.net_salary - r.live.netSalary) > 0.009 && <div className="mt-0.5 text-[10px] text-orange-600" title="Live data changed after finalisation">live: {money(r.live.netSalary)}</div>}
                        </Td>
                        <Td className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => slips([r])} title="Salary slip PDF"><FileDown className="h-4 w-4" /></Button>
                            {r.record
                              ? <Button size="sm" variant="ghost" onClick={() => setUnlock(r)} title="Unlock"><LockOpen className="h-4 w-4" /></Button>
                              : <Button size="sm" variant="ghost" onClick={() => finalize([r])} title="Finalise" disabled={busy === 'finalize'}><Lock className="h-4 w-4" /></Button>}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 font-semibold">
                    <Td colSpan={7}>Total</Td>
                    <Td className="text-right">{money(totals.gross)}</Td><Td className="text-right text-red-600">− {money(totals.pen)}</Td>
                    <Td className="text-right">{money(totals.net)}</Td><Td colSpan={2} />
                  </tr>
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}

      {detail && <BreakdownModal row={detail} onClose={() => setDetail(null)} onChanged={() => { setDetail(null); reload(); }} onSlip={() => slips([detail])} />}
      {unlock && <UnlockModal row={unlock} onClose={() => setUnlock(null)} onDone={() => { setUnlock(null); reload(); }} />}
      {confirmAll && (
        <Modal open onClose={() => setConfirmAll(false)} title={`Finalise payroll – ${monthLabel(ym.year, ym.month)}`}
          footer={<><Button variant="secondary" onClick={() => setConfirmAll(false)}>Cancel</Button><Button loading={busy === 'finalize'} onClick={() => finalize(drafts)}>Finalise {drafts.length} employee(s)</Button></>}>
          <p className="text-sm text-slate-600">Finalising freezes the salary figures and issues salary slips to employees. Attendance, leave approvals, penalties and adjustments for this month are then locked until you unlock the employee's payroll (with a reason).</p>
          {!monthComplete && <Alert tone="warn" className="mt-3">This month has not ended yet – remaining days will not be counted.</Alert>}
          {drafts.some((r) => !r.live.salaryConfigured) && <Alert tone="error" className="mt-3">Some employees have no salary configured; their net salary will be ₹0.</Alert>}
        </Modal>
      )}
    </>
  );
}

function BreakdownModal({ row, onClose, onChanged, onSlip }: { row: Row; onClose: () => void; onChanged: () => void; onSlip: () => void }) {
  const toast = useToast();
  const s = row.shown;
  const locked = Boolean(row.record);
  const [adj, setAdj] = useState({ adj_type: 'deduction' as 'deduction' | 'addition', amount: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addAdj = async () => {
    const amount = Number(adj.amount);
    if (!(amount > 0)) return setErr('Enter an amount greater than 0');
    if (adj.reason.trim().length < 3) return setErr('A reason is mandatory for every adjustment');
    setBusy(true); setErr(null);
    try {
      await must(supabase.from('salary_adjustments').insert({ employee_id: row.emp.id, year: s.year, month: s.month, adj_type: adj.adj_type, amount: Math.round(amount * 100) / 100, reason: adj.reason.trim() }));
      toast('Adjustment added');
      onChanged();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  const delAdj = async (id: string) => {
    try { await must(supabase.from('salary_adjustments').delete().eq('id', id)); toast('Adjustment removed'); onChanged(); }
    catch (e) { toast(errMsg(e), 'error'); }
  };

  const c = s.counts;
  const lines: [string, string][] = [
    ['Monthly salary', money(s.monthlySalary) + (s.salaryChangedMidMonth ? ' (revised mid-month – each day at its own rate)' : '')],
    ['Calendar days in month', String(s.daysInMonth)],
    ['Daily salary', `${money(s.monthlySalary)} ÷ ${s.daysInMonth} = ${money(s.dailyRate)}`],
    ['Full present days', `${c.present}${c.lateExcused ? ` (incl. ${c.lateExcused} late approved as exception)` : ''}`],
    ['Half days', `${c.halfDays} × 0.5 = ${fmtDays(c.halfDays * 0.5)}${c.lateArrivals ? ` (${c.lateArrivals} late arrival(s))` : ''}`],
    ['Approved paid leave', String(c.paidLeave)],
    ['Paid holidays', String(c.paidHolidays)],
    ['Paid weekly offs', String(c.weeklyOffsPaid)],
    ['Unpaid leave / unpaid holidays / unpaid offs', `${c.unpaidLeave} / ${c.unpaidHolidays} / ${c.weeklyOffsUnpaid} (not paid)`],
    ['Absent', `${c.absent} (not paid)`],
    ...(c.notEmployed ? [['Days not employed', String(c.notEmployed)] as [string, string]] : []),
    ...(c.upcoming ? [['Days not yet elapsed', String(c.upcoming)] as [string, string]] : []),
    ['Payable days', fmtDays(s.payableDays)],
    ['Monthly earned salary', money(s.grossEarned)],
    ['Financial penalties', `− ${money(s.penaltiesTotal)}`],
    ['Other approved deductions', `− ${money(s.deductionsTotal)}`],
    ['Additions', `+ ${money(s.additionsTotal)}`],
  ];

  return (
    <Modal open onClose={onClose} size="xl" title={<>{row.emp.full_name} <span className="font-mono text-xs text-slate-500">{row.emp.employee_code}</span> · {monthLabel(s.year, s.month)}</>}
      footer={<><Button variant="secondary" icon={<FileDown className="h-4 w-4" />} onClick={onSlip}>Salary slip PDF</Button><Button onClick={onClose}>Close</Button></>}>
      {locked && <Alert tone="info" className="mb-4">Finalised on {formatDateTime(row.record!.finalized_at)}. Showing the frozen snapshot. Unlock to make changes.</Alert>}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-800">Calculation</h4>
          <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
            {lines.map(([k, v]) => (
              <div key={k} className={`flex justify-between gap-4 px-3 py-2 ${k === 'Payable days' || k === 'Monthly earned salary' ? 'bg-slate-50 font-medium' : ''}`}>
                <dt className="text-slate-600">{k}</dt><dd className="text-right text-slate-900">{v}</dd>
              </div>
            ))}
            <div className="flex justify-between bg-brand-50 px-3 py-2.5 font-semibold text-brand-900"><dt>Net salary</dt><dd>{money(s.netSalary)}</dd></div>
          </dl>

          <h4 className="mb-2 mt-5 text-sm font-semibold text-slate-800">Penalties deducted this month</h4>
          {!s.penalties.length ? <p className="text-sm text-slate-500">None</p> : (
            <ul className="space-y-1 text-sm">{s.penalties.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 rounded bg-red-50 px-3 py-1.5">
                <span>{formatDate(p.penalty_date)} · {PENALTY_CATEGORIES.find((x) => x.value === p.category)?.label} · {p.reason}</span><span className="font-medium text-red-700">{money(p.amount)}</span>
              </li>))}</ul>
          )}

          <h4 className="mb-2 mt-5 text-sm font-semibold text-slate-800">Exceptional adjustments</h4>
          {s.adjustments.length > 0 && (
            <ul className="mb-3 space-y-1 text-sm">{s.adjustments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded bg-slate-50 px-3 py-1.5">
                <span>{a.adj_type === 'addition' ? '+' : '−'} {money(a.amount)} · {a.reason} <span className="text-xs text-slate-400">{formatDateTime(a.created_at)}</span></span>
                {!locked && <button onClick={() => delAdj(a.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>}
              </li>))}</ul>
          )}
          {!locked && (
            <div className="rounded-lg border border-dashed border-slate-300 p-3">
              <div className="grid gap-2 sm:grid-cols-[130px_120px_1fr]">
                <Select value={adj.adj_type} onChange={(e) => setAdj({ ...adj, adj_type: e.target.value as 'deduction' | 'addition' })}>
                  <option value="deduction">Deduction</option><option value="addition">Addition</option>
                </Select>
                <Input type="number" min="0" step="0.01" placeholder="Amount" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} />
                <Input placeholder="Reason (mandatory, audited)" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
              </div>
              {err && <Alert tone="error" className="mt-2">{err}</Alert>}
              <Button size="sm" className="mt-2" icon={<Plus className="h-3.5 w-3.5" />} loading={busy} onClick={addAdj}>Add adjustment</Button>
            </div>
          )}
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-800">Day-by-day</h4>
          <div className="max-h-[520px] overflow-y-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-slate-50"><tr><th className="px-2 py-1.5 text-left">Date</th><th className="px-2 py-1.5 text-left">Classification</th><th className="px-2 py-1.5 text-right">Pay units</th><th className="px-2 py-1.5 text-right">Amount</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {s.days.map((d) => (
                  <tr key={d.date} className={d.fraction === 0 && d.kind !== 'not_employed' && d.kind !== 'upcoming' ? 'bg-red-50/50' : ''}>
                    <td className="whitespace-nowrap px-2 py-1">{d.date.slice(8)} {WEEKDAYS[dayOfWeek(d.date)].slice(0, 3)}</td>
                    <td className="px-2 py-1">{DAY_KIND_LABEL[d.kind]}{d.note ? <span className="text-slate-400"> · {d.note}</span> : ''}</td>
                    <td className="px-2 py-1 text-right">{d.fraction}</td>
                    <td className="px-2 py-1 text-right">{d.amount ? money(d.amount) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function UnlockModal({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    if (reason.trim().length < 3) return setErr('Reason is required');
    setBusy(true);
    try {
      await must(supabase.rpc('unlock_payroll', { p_payroll_id: row.record!.id, p_reason: reason.trim() }));
      toast('Payroll unlocked – re-finalise after making corrections');
      onDone();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Unlock payroll – ${row.emp.full_name}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" loading={busy} onClick={go}>Unlock</Button></>}>
      <p className="mb-3 text-sm text-slate-600">The issued salary slip will be withdrawn and the month becomes editable. The finalised snapshot is kept in the audit log.</p>
      <Field label="Reason" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      {err && <Alert tone="error" className="mt-3">{err}</Alert>}
    </Modal>
  );
}
