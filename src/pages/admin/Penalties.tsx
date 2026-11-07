import { Download, Plus, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../../components/Toast';
import {
  Alert, Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, MonthPicker, PageHeader, Select, StatCard, Table, Td, Textarea, Th,
} from '../../components/ui';
import { fetchAll, fetchEmployees } from '../../lib/api';
import { currentYearMonth, formatDate, formatDateTime, monthLabel, parseYMD, todayIST } from '../../lib/dates';
import { downloadCSV } from '../../lib/export';
import { money } from '../../lib/format';
import { useData } from '../../lib/hooks';
import { errMsg, must, supabase } from '../../lib/supabase';
import { PENALTY_CATEGORIES, type Employee, type Penalty, type PenaltyCategory } from '../../lib/types';
import { Gavel, IndianRupee, AlertTriangle } from 'lucide-react';

export default function PenaltiesPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [ym, setYm] = useState<{ year: number; month: number } | null>(currentYearMonth());
  const [empFilter, setEmpFilter] = useState(params.get('employee') ?? '');
  const [status, setStatus] = useState<'' | 'active' | 'waived'>('');
  const [adding, setAdding] = useState(false);
  const [waive, setWaive] = useState<Penalty | null>(null);
  const [del, setDel] = useState<Penalty | null>(null);

  useEffect(() => { if (params.get('employee')) { setAdding(true); setYm(null); } }, [params]);

  const { data, loading, error, reload } = useData(async () => {
    const [penalties, employees] = await Promise.all([
      fetchAll<Penalty>((f, t) => supabase.from('penalties').select('*').order('penalty_date', { ascending: false }).range(f, t)),
      fetchEmployees(),
    ]);
    return { penalties, employees, emps: new Map(employees.map((e) => [e.id, e])) };
  }, []);

  const rows = useMemo(() => (data?.penalties ?? [])
    .filter((p) => !ym || (p.deduction_year === ym.year && p.deduction_month === ym.month))
    .filter((p) => !empFilter || p.employee_id === empFilter)
    .filter((p) => !status || p.status === status), [data, ym, empFilter, status]);

  const totalActive = rows.filter((p) => p.status === 'active').reduce((s, p) => s + Number(p.amount), 0);
  const catLabel = (c: PenaltyCategory) => PENALTY_CATEGORIES.find((x) => x.value === c)?.label ?? c;

  const exportCsv = () => downloadCSV(`penalties${ym ? `-${ym.year}-${String(ym.month).padStart(2, '0')}` : ''}.csv`,
    ['Employee ID', 'Employee Name', 'Date', 'Category', 'Type', 'Reason', 'Amount', 'Deduction month', 'Status', 'Waiver reason', 'Notes'],
    rows.map((p) => {
      const e = data!.emps.get(p.employee_id);
      return [e?.employee_code, e?.full_name, p.penalty_date, catLabel(p.category), p.penalty_type, p.reason, p.amount, monthLabel(p.deduction_year, p.deduction_month), p.status, p.waived_reason, p.notes];
    }));

  const remove = async () => {
    if (!del) return;
    try { await must(supabase.from('penalties').delete().eq('id', del.id)); toast('Penalty deleted'); setDel(null); reload(); }
    catch (e) { toast(errMsg(e), 'error'); }
  };

  return (
    <>
      <PageHeader title="Penalty Management" subtitle="Financial penalties are deducted once, in the selected deduction month. Warnings are recorded without deduction."
        actions={<>
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>Add penalty</Button>
        </>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Penalties (filtered)" value={rows.length} icon={<Gavel className="h-5 w-5" />} />
        <StatCard label="Active deduction amount" value={money(totalActive)} icon={<IndianRupee className="h-5 w-5" />} tone="red" />
        <StatCard label="Warnings" value={rows.filter((p) => p.penalty_type === 'warning').length} icon={<AlertTriangle className="h-5 w-5" />} tone="amber" />
      </div>
      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          {ym ? <MonthPicker year={ym.year} month={ym.month} onChange={(year, month) => setYm({ year, month })} />
            : <span className="text-sm text-slate-500">All months</span>}
          <Button size="sm" variant="ghost" onClick={() => setYm(ym ? null : currentYearMonth())}>{ym ? 'Show all months' : 'Filter by month'}</Button>
          <Select value={empFilter} onChange={(e) => { setEmpFilter(e.target.value); setParams({}); }} className="w-64">
            <option value="">All employees</option>
            {data?.employees.map((e) => <option key={e.id} value={e.id}>{e.employee_code} – {e.full_name}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-36">
            <option value="">Any status</option><option value="active">Active</option><option value="waived">Waived</option>
          </Select>
        </div>
        {loading ? <Loading /> : error ? <Alert tone="error" className="m-4">{error}</Alert> : !rows.length ? <EmptyState title="No penalties found" /> : (
          <Table>
            <thead><tr><Th>Employee ID</Th><Th>Employee name</Th><Th>Date</Th><Th>Category</Th><Th>Reason</Th><Th className="text-right">Amount</Th><Th>Deduct in</Th><Th>Status</Th><Th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p) => {
                const e = data!.emps.get(p.employee_id);
                return (
                  <tr key={p.id} className="align-top">
                    <Td className="font-mono text-xs font-semibold">{e?.employee_code}</Td>
                    <Td className="font-medium">{e?.full_name}</Td>
                    <Td>{formatDate(p.penalty_date)}</Td>
                    <Td>{catLabel(p.category)}</Td>
                    <Td className="max-w-xs whitespace-normal">{p.reason}{p.notes && <p className="text-xs text-slate-500">{p.notes}</p>}{p.waived_reason && <p className="text-xs text-slate-500">Waived: {p.waived_reason}</p>}</Td>
                    <Td className="text-right font-medium">{p.penalty_type === 'warning' ? <Badge tone="yellow">warning</Badge> : money(p.amount)}</Td>
                    <Td>{monthLabel(p.deduction_year, p.deduction_month)}</Td>
                    <Td><Badge tone={p.status === 'active' ? 'red' : 'grey'}>{p.status}</Badge><div className="mt-0.5 text-[10px] text-slate-400">{formatDateTime(p.created_at)}</div></Td>
                    <Td className="text-right">
                      {p.status === 'active' && p.penalty_type === 'financial' && <Button size="sm" variant="ghost" onClick={() => setWaive(p)} title="Waive"><Undo2 className="h-4 w-4" /></Button>}
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDel(p)} title="Delete"><Trash2 className="h-4 w-4" /></Button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {adding && data && <AddPenaltyModal employees={data.employees.filter((e) => e.status === 'active')} preset={params.get('employee') ?? ''}
        onClose={() => { setAdding(false); setParams({}); }} onDone={() => { setAdding(false); setParams({}); reload(); }} />}
      {waive && <WaiveModal penalty={waive} onClose={() => setWaive(null)} onDone={() => { setWaive(null); reload(); }} />}
      {del && (
        <Modal open onClose={() => setDel(null)} title="Delete penalty" footer={<><Button variant="secondary" onClick={() => setDel(null)}>Cancel</Button><Button variant="danger" onClick={remove}>Delete</Button></>}>
          <p className="text-sm text-slate-600">Delete this penalty permanently? (Use <b>Waive</b> instead if you want to keep a record.) The deletion is recorded in the audit log.</p>
        </Modal>
      )}
    </>
  );
}

function AddPenaltyModal({ employees, preset, onClose, onDone }: { employees: Employee[]; preset: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const t = todayIST();
  const [f, setF] = useState({
    employee_id: preset, penalty_date: t, category: 'other' as PenaltyCategory, penalty_type: 'financial' as 'financial' | 'warning',
    amount: '', reason: '', notes: '', deduction_year: parseYMD(t).y, deduction_month: parseYMD(t).m,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const emp = employees.find((e) => e.id === f.employee_id);

  const save = async () => {
    if (!f.employee_id) return setErr('Select an employee');
    if (f.reason.trim().length < 3) return setErr('Reason is required');
    const amount = f.penalty_type === 'warning' ? 0 : Number(f.amount);
    if (f.penalty_type === 'financial' && !(amount > 0)) return setErr('Enter a penalty amount greater than 0');
    setBusy(true); setErr(null);
    try {
      await must(supabase.from('penalties').insert({
        employee_id: f.employee_id, penalty_date: f.penalty_date, category: f.category, penalty_type: f.penalty_type,
        amount: Math.round(amount * 100) / 100, reason: f.reason.trim(), notes: f.notes.trim() || null,
        deduction_year: f.deduction_year, deduction_month: f.deduction_month,
      }));
      toast('Penalty added');
      onDone();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="Add penalty" size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Add penalty</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Employee ID" required>
          <Select value={f.employee_id} onChange={(e) => setF({ ...f, employee_id: e.target.value })}>
            <option value="">Select…</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.employee_code}</option>)}
          </Select>
        </Field>
        <Field label="Employee name">
          <Select value={f.employee_id} onChange={(e) => setF({ ...f, employee_id: e.target.value })}>
            <option value="">Select…</option>{[...employees].sort((a, b) => a.full_name.localeCompare(b.full_name)).map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </Select>
        </Field>
        <Field label="Date" required><Input type="date" value={f.penalty_date} max={t} onChange={(e) => {
          const d = e.target.value; if (!d) return;
          setF({ ...f, penalty_date: d, deduction_year: parseYMD(d).y, deduction_month: parseYMD(d).m });
        }} /></Field>
        <Field label="Category">
          <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as PenaltyCategory })}>
            {PENALTY_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={f.penalty_type} onChange={(e) => setF({ ...f, penalty_type: e.target.value as 'financial' | 'warning' })}>
            <option value="financial">Financial (deduct from salary)</option><option value="warning">Warning only (no deduction)</option>
          </Select>
        </Field>
        <Field label="Amount (₹)" required={f.penalty_type === 'financial'}>
          <Input type="number" min="0" step="0.01" value={f.penalty_type === 'warning' ? '0' : f.amount} disabled={f.penalty_type === 'warning'} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </Field>
        {f.penalty_type === 'financial' && (
          <Field label="Deduct from salary of" className="sm:col-span-2" hint="Defaults to the month of the penalty date. Finalised months cannot be chosen.">
            <MonthPicker year={f.deduction_year} month={f.deduction_month} onChange={(y, m) => setF({ ...f, deduction_year: y, deduction_month: m })} />
          </Field>
        )}
        <Field label="Reason" required className="sm:col-span-2"><Textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <Field label="Internal notes" className="sm:col-span-2"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      {f.category === 'late_coming' && <Alert tone="warn" className="mt-3">Late arrivals already result in a half-day deduction automatically. Only add a late-coming penalty if your policy has an additional fine, to avoid double deduction.</Alert>}
      {emp && <p className="mt-3 text-xs text-slate-500">Penalty for {emp.full_name} ({emp.employee_code}) – {emp.designation}</p>}
      {err && <Alert tone="error" className="mt-3">{err}</Alert>}
    </Modal>
  );
}

function WaiveModal({ penalty, onClose, onDone }: { penalty: Penalty; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    if (reason.trim().length < 3) return setErr('Reason is required');
    setBusy(true);
    try {
      await must(supabase.from('penalties').update({ status: 'waived', waived_reason: reason.trim() }).eq('id', penalty.id));
      toast('Penalty waived');
      onDone();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Waive penalty" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={go}>Waive</Button></>}>
      <p className="mb-3 text-sm text-slate-600">Waive the penalty of <b>{money(penalty.amount)}</b> dated {formatDate(penalty.penalty_date)}? It will no longer be deducted.</p>
      <Field label="Reason" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      {err && <Alert tone="error" className="mt-3">{err}</Alert>}
    </Modal>
  );
}
