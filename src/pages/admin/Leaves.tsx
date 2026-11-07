import { Check, Paperclip, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useToast } from '../../components/Toast';
import {
  Alert, Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, PageHeader, Select, Table, Tabs, Td, Textarea, Th, leaveStatusTone,
} from '../../components/ui';
import { fetchAll, fetchEmployees, fetchLeaveTypes } from '../../lib/api';
import { formatDate, formatDateTime, todayIST } from '../../lib/dates';
import { useData } from '../../lib/hooks';
import { errMsg, must, signedUrl, supabase } from '../../lib/supabase';
import type { Employee, LeaveRequest, LeaveStatus, LeaveType } from '../../lib/types';

type Tab = 'pending' | 'all';

export default function LeavesPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('pending');
  const [status, setStatus] = useState<'' | LeaveStatus>('');
  const [typeId, setTypeId] = useState('');
  const [q, setQ] = useState('');
  const [review, setReview] = useState<{ leave: LeaveRequest; decision: 'approved' | 'rejected' | 'cancelled' } | null>(null);
  const [adding, setAdding] = useState(false);

  const { data, loading, error, reload } = useData(async () => {
    const [leaves, employees, types] = await Promise.all([
      fetchAll<LeaveRequest>((f, t) => supabase.from('leave_requests').select('*').order('created_at', { ascending: false }).range(f, t)),
      fetchEmployees(),
      fetchLeaveTypes(),
    ]);
    return { leaves, emps: new Map(employees.map((e) => [e.id, e])), employees, types };
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.leaves
      .filter((l) => (tab === 'pending' ? l.status === 'pending' : !status || l.status === status))
      .filter((l) => !typeId || l.leave_type_id === typeId)
      .filter((l) => {
        if (!q) return true;
        const e = data.emps.get(l.employee_id);
        return `${e?.employee_code} ${e?.full_name}`.toLowerCase().includes(q.toLowerCase());
      });
  }, [data, tab, status, typeId, q]);

  const pendingCount = data?.leaves.filter((l) => l.status === 'pending').length ?? 0;
  const typeOf = (id: string) => data?.types.find((t) => t.id === id);

  const openAttachment = async (path: string) => {
    const url = await signedUrl('leave-attachments', path, 300);
    if (url) window.open(url, '_blank', 'noopener'); else toast('Could not open attachment', 'error');
  };

  return (
    <>
      <PageHeader title="Leave Requests" subtitle="Approve or reject leave applications. Only approved leave is treated as leave in attendance and payroll."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>Record leave for employee</Button>} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ value: 'pending', label: `Pending (${pendingCount})` }, { value: 'all', label: 'All applications' }]} />
      <Card bodyClassName="p-0">
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee" className="w-56" />
          {tab === 'all' && (
            <Select value={status} onChange={(e) => setStatus(e.target.value as LeaveStatus | '')} className="w-40">
              <option value="">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option>
            </Select>
          )}
          <Select value={typeId} onChange={(e) => setTypeId(e.target.value)} className="w-52">
            <option value="">All leave types</option>
            {data?.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </div>
        {loading ? <Loading /> : error ? <Alert tone="error" className="m-4">{error}</Alert> : !rows.length ? (
          <EmptyState title={tab === 'pending' ? 'No pending leave requests 🎉' : 'No leave applications'} />
        ) : (
          <Table>
            <thead><tr><Th>Employee</Th><Th>Leave type</Th><Th>Dates</Th><Th>Days</Th><Th>Reason</Th><Th>Applied</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((l) => {
                const e = data!.emps.get(l.employee_id);
                const t = typeOf(l.leave_type_id);
                return (
                  <tr key={l.id} className="align-top">
                    <Td><div className="font-medium">{e?.full_name}</div><div className="font-mono text-xs text-slate-500">{e?.employee_code}</div></Td>
                    <Td>{t?.name}<div><Badge tone={t?.is_paid ? 'green' : 'grey'}>{t?.is_paid ? 'paid' : 'unpaid'}</Badge></div></Td>
                    <Td>{formatDate(l.start_date)}{l.end_date !== l.start_date && <> – {formatDate(l.end_date)}</>}</Td>
                    <Td>{l.days}</Td>
                    <Td className="max-w-xs whitespace-normal">
                      <p className="line-clamp-3">{l.reason}</p>
                      {l.attachment_path && <button onClick={() => openAttachment(l.attachment_path!)} className="mt-1 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"><Paperclip className="h-3 w-3" /> attachment</button>}
                      {l.admin_comment && <p className="mt-1 text-xs text-slate-500">Admin: {l.admin_comment}</p>}
                    </Td>
                    <Td className="text-xs text-slate-500">{formatDateTime(l.created_at)}</Td>
                    <Td><Badge tone={leaveStatusTone(l.status)}>{l.status}</Badge></Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        {l.status === 'pending' && <>
                          <Button size="sm" variant="success" icon={<Check className="h-3.5 w-3.5" />} onClick={() => setReview({ leave: l, decision: 'approved' })}>Approve</Button>
                          <Button size="sm" variant="danger" icon={<X className="h-3.5 w-3.5" />} onClick={() => setReview({ leave: l, decision: 'rejected' })}>Reject</Button>
                        </>}
                        {l.status === 'approved' && <Button size="sm" variant="secondary" onClick={() => setReview({ leave: l, decision: 'cancelled' })}>Cancel</Button>}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {review && data && (
        <ReviewModal review={review} employee={data.emps.get(review.leave.employee_id)} type={typeOf(review.leave.leave_type_id)} allLeaves={data.leaves}
          onClose={() => setReview(null)} onDone={() => { setReview(null); reload(); }} />
      )}
      {adding && data && <AddLeaveModal employees={data.employees.filter((e) => e.status === 'active')} types={data.types} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
    </>
  );
}

function ReviewModal({ review, employee, type, allLeaves, onClose, onDone }: {
  review: { leave: LeaveRequest; decision: 'approved' | 'rejected' | 'cancelled' }; employee?: Employee; type?: LeaveType; allLeaves: LeaveRequest[];
  onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { leave, decision } = review;
  const year = leave.start_date.slice(0, 4);
  const used = allLeaves.filter((l) => l.employee_id === leave.employee_id && l.leave_type_id === leave.leave_type_id && l.status === 'approved' && l.start_date.startsWith(year))
    .reduce((s, l) => s + Number(l.days), 0);

  const go = async () => {
    if (decision !== 'approved' && comment.trim().length < 3) return setErr('Please give a reason');
    setBusy(true); setErr(null);
    try {
      if (decision === 'cancelled') await must(supabase.rpc('cancel_leave', { p_leave_id: leave.id, p_reason: comment.trim() }));
      else await must(supabase.rpc('admin_review_leave', { p_leave_id: leave.id, p_decision: decision, p_comment: comment.trim() || null }));
      toast(`Leave ${decision}`);
      onDone();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={`${decision === 'approved' ? 'Approve' : decision === 'rejected' ? 'Reject' : 'Cancel'} leave`}
      footer={<><Button variant="secondary" onClick={onClose}>Back</Button><Button variant={decision === 'approved' ? 'success' : 'danger'} loading={busy} onClick={go}>Confirm</Button></>}>
      <dl className="mb-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
        <div><dt className="text-xs text-slate-500">Employee</dt><dd className="font-medium">{employee?.full_name} ({employee?.employee_code})</dd></div>
        <div><dt className="text-xs text-slate-500">Leave type</dt><dd>{type?.name} · {type?.is_paid ? 'paid' : 'unpaid'}</dd></div>
        <div><dt className="text-xs text-slate-500">Dates</dt><dd>{formatDate(leave.start_date)} – {formatDate(leave.end_date)}</dd></div>
        <div><dt className="text-xs text-slate-500">Working days</dt><dd>{leave.days}</dd></div>
        {type?.annual_quota != null && (
          <div className="col-span-2"><dt className="text-xs text-slate-500">{year} balance</dt>
            <dd>{used} of {type.annual_quota} used{decision === 'approved' && <> → <b>{used + Number(leave.days)}</b> after approval</>}</dd></div>
        )}
        <div className="col-span-2"><dt className="text-xs text-slate-500">Reason</dt><dd className="whitespace-pre-line">{leave.reason}</dd></div>
      </dl>
      <Field label={decision === 'approved' ? 'Comment (optional)' : 'Reason'} required={decision !== 'approved'}>
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
      {err && <Alert tone="error" className="mt-3">{err}</Alert>}
    </Modal>
  );
}

function AddLeaveModal({ employees, types, onClose, onDone }: { employees: Employee[]; types: LeaveType[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ employee_id: '', leave_type_id: types.find((t) => t.is_active)?.id ?? '', start_date: todayIST(), end_date: todayIST(), reason: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    if (!f.employee_id || !f.leave_type_id) return setErr('Select employee and leave type');
    if (f.end_date < f.start_date) return setErr('End date is before start date');
    if (f.reason.trim().length < 3) return setErr('Reason is required');
    setBusy(true); setErr(null);
    try {
      await must(supabase.from('leave_requests').insert({ ...f, reason: f.reason.trim(), status: 'approved', admin_comment: 'Recorded by admin' }));
      toast('Approved leave recorded');
      onDone();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Record approved leave"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={go}>Save</Button></>}>
      <p className="mb-4 text-sm text-slate-500">Use this for leave agreed outside the portal (e.g. emergency). It is saved as approved; notice-period rules don't apply, quotas do.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Employee" required className="sm:col-span-2">
          <Select value={f.employee_id} onChange={(e) => setF({ ...f, employee_id: e.target.value })}>
            <option value="">Select…</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.employee_code} – {e.full_name}</option>)}
          </Select>
        </Field>
        <Field label="Leave type" required className="sm:col-span-2">
          <Select value={f.leave_type_id} onChange={(e) => setF({ ...f, leave_type_id: e.target.value })}>
            {types.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.is_paid ? 'paid' : 'unpaid'})</option>)}
          </Select>
        </Field>
        <Field label="From" required><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
        <Field label="To" required><Input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
        <Field label="Reason" required className="sm:col-span-2"><Textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      </div>
      {err && <Alert tone="error" className="mt-3">{err}</Alert>}
    </Modal>
  );
}
