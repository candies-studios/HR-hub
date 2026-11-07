import { ArrowLeft, Download, KeyRound, Pencil, Power, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MonthAttendance } from '../../components/MonthAttendance';
import { useToast } from '../../components/Toast';
import {
  Alert, Avatar, Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, PageHeader, Table, Tabs, Td, Textarea, Th, leaveStatusTone,
} from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { fetchLeaveTypes, snapshotOf } from '../../lib/api';
import { currentYearMonth, dobToPassword, formatDate, formatDateTime, monthLabel, todayIST } from '../../lib/dates';
import { money } from '../../lib/format';
import { useData, useSignedUrl } from '../../lib/hooks';
import { salarySlipPDF } from '../../lib/pdf';
import { dailySalary, salaryOn } from '../../lib/salary';
import { adminEmployees, errMsg, must, supabase } from '../../lib/supabase';
import { PENALTY_CATEGORIES, type Employee, type LeaveRequest, type PayrollRecord, type Penalty, type SalaryRevision } from '../../lib/types';

type Tab = 'overview' | 'attendance' | 'salary' | 'leaves' | 'penalties' | 'slips';

export default function EmployeeDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { settings } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [modal, setModal] = useState<'revise' | 'status' | 'reset' | null>(null);

  const { data, loading, error, reload } = useData(async () => {
    const [emp, revisions, leaves, penalties, payroll, leaveTypes] = await Promise.all([
      must(supabase.from('employees').select('*').eq('id', id!).single()) as Promise<Employee>,
      must(supabase.from('salary_revisions').select('*').eq('employee_id', id!).order('effective_date', { ascending: false })) as Promise<SalaryRevision[]>,
      must(supabase.from('leave_requests').select('*').eq('employee_id', id!).order('start_date', { ascending: false })) as Promise<LeaveRequest[]>,
      must(supabase.from('penalties').select('*').eq('employee_id', id!).order('penalty_date', { ascending: false })) as Promise<Penalty[]>,
      must(supabase.from('payroll_records').select('*').eq('employee_id', id!).order('year', { ascending: false }).order('month', { ascending: false })) as Promise<PayrollRecord[]>,
      fetchLeaveTypes(),
    ]);
    return { emp, revisions, leaves, penalties, payroll, leaveTypes };
  }, [id]);
  const photo = useSignedUrl('avatars', data?.emp.photo_path);

  if (loading && !data) return <Loading />;
  if (error || !data) return <Alert tone="error">{error ?? 'Employee not found'}</Alert>;
  const { emp, revisions, leaves, penalties, payroll, leaveTypes } = data;
  const today = todayIST();
  const current = salaryOn(revisions, today);
  const currentRev = revisions.find((r) => r.effective_date <= today);
  const { year, month } = currentYearMonth();
  const typeName = (tid: string) => leaveTypes.find((t) => t.id === tid)?.name ?? '—';

  const info: [string, string | null][] = [
    ['Employee ID', emp.employee_code], ['Full name', emp.full_name], ['Date of birth', formatDate(emp.date_of_birth)],
    ['E-mail', emp.email], ['Primary contact', emp.phone], ['Alternate contact', emp.alt_phone ? `${emp.alt_phone}${emp.alt_contact_relation ? ` (${emp.alt_contact_relation})` : ''}` : null],
    ['Blood group', emp.blood_group], ['Date of joining', formatDate(emp.date_of_joining)], ['Designation', emp.designation],
    ['Monthly salary', money(current)], ['Daily salary (this month)', money(dailySalary(current, year, month))],
    ['Salary effective date', formatDate(currentRev?.effective_date)], ['Employment status', emp.status === 'active' ? 'Active' : `Inactive${emp.inactive_from ? ` (last day ${formatDate(emp.inactive_from)})` : ''}`],
  ];

  return (
    <>
      <Link to="/admin/employees" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Employees</Link>
      <PageHeader
        title={emp.full_name}
        subtitle={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{emp.employee_code}</span>· {emp.designation} <Badge tone={emp.status === 'active' ? 'green' : 'grey'}>{emp.status}</Badge></span>}
        actions={<>
          <Link to={`/admin/employees/${emp.id}/edit`}><Button variant="secondary" icon={<Pencil className="h-4 w-4" />}>Edit</Button></Link>
          <Button variant="secondary" icon={<TrendingUp className="h-4 w-4" />} onClick={() => setModal('revise')}>Revise salary</Button>
          <Button variant="secondary" icon={<KeyRound className="h-4 w-4" />} onClick={() => setModal('reset')}>Reset password</Button>
          <Button variant={emp.status === 'active' ? 'danger' : 'success'} icon={<Power className="h-4 w-4" />} onClick={() => setModal('status')}>
            {emp.status === 'active' ? 'Deactivate' : 'Activate'}
          </Button>
        </>}
      />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { value: 'overview', label: 'Profile' }, { value: 'attendance', label: 'Attendance' }, { value: 'salary', label: 'Salary history' },
        { value: 'leaves', label: `Leaves (${leaves.length})` }, { value: 'penalties', label: `Penalties (${penalties.length})` }, { value: 'slips', label: `Salary slips (${payroll.length})` },
      ]} />

      {tab === 'overview' && (
        <Card>
          <div className="flex flex-col gap-6 sm:flex-row">
            <Avatar name={emp.full_name} url={photo} size={96} />
            <dl className="grid flex-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {info.map(([k, v]) => (
                <div key={k}><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt><dd className="mt-0.5 text-sm text-slate-900">{v || '—'}</dd></div>
              ))}
            </dl>
          </div>
        </Card>
      )}

      {tab === 'attendance' && <MonthAttendance employee={emp} editable />}

      {tab === 'salary' && (
        <Card title="Salary revision history" actions={<Button size="sm" onClick={() => setModal('revise')}>Revise salary</Button>} bodyClassName="p-0">
          <Table>
            <thead><tr><Th>Effective from</Th><Th className="text-right">Monthly salary</Th><Th>Reason</Th><Th>Recorded</Th><Th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {revisions.map((r) => (
                <tr key={r.id}>
                  <Td>{formatDate(r.effective_date)}</Td>
                  <Td className="text-right font-medium">{money(r.monthly_salary)}</Td>
                  <Td>{r.reason ?? '—'}</Td>
                  <Td className="text-xs text-slate-500">{formatDateTime(r.created_at)}</Td>
                  <Td>{r.id === currentRev?.id ? <Badge tone="green">current</Badge> : r.effective_date > today ? <Badge tone="blue">scheduled</Badge> : null}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="px-5 py-3 text-xs text-slate-500">Each day is paid at the salary in force on that day, so revisions never change already-calculated earlier months. Months with finalised payroll are locked.</p>
        </Card>
      )}

      {tab === 'leaves' && (
        <Card bodyClassName="p-0">
          {!leaves.length ? <EmptyState title="No leave applications" /> : (
            <Table>
              <thead><tr><Th>Type</Th><Th>From</Th><Th>To</Th><Th>Days</Th><Th>Reason</Th><Th>Status</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {leaves.map((l) => (
                  <tr key={l.id}>
                    <Td>{typeName(l.leave_type_id)}</Td><Td>{formatDate(l.start_date)}</Td><Td>{formatDate(l.end_date)}</Td><Td>{l.days}</Td>
                    <Td className="max-w-xs truncate">{l.reason}</Td><Td><Badge tone={leaveStatusTone(l.status)}>{l.status}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === 'penalties' && (
        <Card bodyClassName="p-0" actions={<Link to={`/admin/penalties?employee=${emp.id}`}><Button size="sm">Add penalty</Button></Link>} title="Penalties">
          {!penalties.length ? <EmptyState title="No penalties" /> : (
            <Table>
              <thead><tr><Th>Date</Th><Th>Category</Th><Th>Reason</Th><Th className="text-right">Amount</Th><Th>Deducted in</Th><Th>Status</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {penalties.map((p) => (
                  <tr key={p.id}>
                    <Td>{formatDate(p.penalty_date)}</Td><Td>{PENALTY_CATEGORIES.find((c) => c.value === p.category)?.label}</Td>
                    <Td className="max-w-xs truncate">{p.reason}</Td>
                    <Td className="text-right">{p.penalty_type === 'warning' ? <Badge>warning</Badge> : money(p.amount)}</Td>
                    <Td>{monthLabel(p.deduction_year, p.deduction_month)}</Td>
                    <Td><Badge tone={p.status === 'active' ? 'red' : 'grey'}>{p.status}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === 'slips' && (
        <Card bodyClassName="p-0">
          {!payroll.length ? <EmptyState title="No finalised payroll yet">Finalise payroll from the Payroll page to issue salary slips.</EmptyState> : (
            <Table>
              <thead><tr><Th>Month</Th><Th>Payable days</Th><Th className="text-right">Earned</Th><Th className="text-right">Deductions</Th><Th className="text-right">Net</Th><Th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {payroll.map((p) => (
                  <tr key={p.id}>
                    <Td>{monthLabel(p.year, p.month)}</Td><Td>{p.payable_days}</Td><Td className="text-right">{money(p.gross_earned)}</Td>
                    <Td className="text-right">{money(Number(p.total_penalties) + Number(p.total_deductions))}</Td>
                    <Td className="text-right font-semibold">{money(p.net_salary)}</Td>
                    <Td><Button size="sm" variant="secondary" icon={<Download className="h-3.5 w-3.5" />} onClick={() => settings && salarySlipPDF(
                      [{ employee: emp, result: snapshotOf(p), settings, finalizedAt: p.finalized_at }],
                      `salary-slip-${emp.employee_code}-${p.year}-${String(p.month).padStart(2, '0')}.pdf`)}>PDF</Button></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {modal === 'revise' && <ReviseSalaryModal emp={emp} current={current} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); toast('Salary revised'); }} />}
      {modal === 'status' && <StatusModal emp={emp} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
      {modal === 'reset' && (
        <ResetModal emp={emp} onClose={() => setModal(null)} />
      )}
    </>
  );
}

function ReviseSalaryModal({ emp, current, onClose, onDone }: { emp: Employee; current: number; onClose: () => void; onDone: () => void }) {
  const { year, month } = currentYearMonth();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(`${year}-${String(month).padStart(2, '0')}-01`);
  const [designation, setDesignation] = useState(emp.designation);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setErr(null);
    const n = Number(amount);
    if (!(n > 0)) return setErr('Enter a valid salary');
    if (!date) return setErr('Select the effective date');
    if (reason.trim().length < 3) return setErr('Reason is required');
    setBusy(true);
    try {
      await must(supabase.from('salary_revisions').insert({ employee_id: emp.id, monthly_salary: Math.round(n * 100) / 100, effective_date: date, reason: reason.trim() }));
      if (designation.trim() && designation.trim() !== emp.designation) {
        await must(supabase.from('employees').update({ designation: designation.trim() }).eq('id', emp.id));
      }
      onDone();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Revise salary / designation" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save revision</Button></>}>
      <p className="mb-4 text-sm text-slate-600">Current salary: <b>{money(current)}</b>. The new salary applies from the effective date onward; earlier days keep the old rate.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New monthly salary (₹)" required><Input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Effective date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Designation" className="sm:col-span-2"><Input value={designation} onChange={(e) => setDesignation(e.target.value)} /></Field>
        <Field label="Reason" required className="sm:col-span-2"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Annual increment 2026" /></Field>
      </div>
      {err && <Alert tone="error" className="mt-3">{err}</Alert>}
    </Modal>
  );
}

function StatusModal({ emp, onClose, onDone }: { emp: Employee; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const deactivate = emp.status === 'active';
  const [date, setDate] = useState(todayIST());
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setErr(null);
    if (reason.trim().length < 3) return setErr('Reason is required');
    setBusy(true);
    try {
      await adminEmployees({ action: 'set_status', employee_id: emp.id, status: deactivate ? 'inactive' : 'active', inactive_from: date, reason });
      toast(deactivate ? 'Employee deactivated – login disabled' : 'Employee re-activated');
      onDone();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={deactivate ? `Deactivate ${emp.full_name}` : `Activate ${emp.full_name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={deactivate ? 'danger' : 'success'} loading={busy} onClick={save}>{deactivate ? 'Deactivate' : 'Activate'}</Button></>}>
      <p className="mb-4 text-sm text-slate-600">
        {deactivate ? 'The employee will no longer be able to log in. Records are kept; salary is calculated up to the last working date.' : 'The employee will be able to log in again.'}
      </p>
      <div className="grid gap-4">
        {deactivate && <Field label="Last working date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>}
        <Field label="Reason" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
      {err && <Alert tone="error" className="mt-3">{err}</Alert>}
    </Modal>
  );
}

function ResetModal({ emp, onClose }: { emp: Employee; onClose: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    try {
      await adminEmployees({ action: 'reset_password', employee_id: emp.id });
      toast(`Password reset to ${dobToPassword(emp.date_of_birth)} – the employee must change it at next login`);
      onClose();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Reset password" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={go}>Reset password</Button></>}>
      <p className="text-sm text-slate-600">Reset the password of <b>{emp.full_name}</b> ({emp.employee_code}) back to their date of birth (<b>DDMMYYYY</b>). They will be forced to set a new password at the next login.</p>
      {err && <Alert tone="error" className="mt-3">{err}</Alert>}
    </Modal>
  );
}
