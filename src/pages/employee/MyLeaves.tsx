import { CalendarPlus, Paperclip } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '../../components/Toast';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, PageHeader, Select, Table, Td, Textarea, Th, leaveStatusTone } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { fetchLeaveTypes } from '../../lib/api';
import { addDays, formatDate, formatDateTime, todayIST } from '../../lib/dates';
import { useData } from '../../lib/hooks';
import { errMsg, must, signedUrl, supabase } from '../../lib/supabase';
import type { Employee, LeaveRequest, LeaveType } from '../../lib/types';

export default function MyLeaves() {
  const { employee } = useAuth();
  const toast = useToast();
  const [applying, setApplying] = useState(false);
  const [cancel, setCancel] = useState<LeaveRequest | null>(null);
  const year = todayIST().slice(0, 4);

  const { data, loading, error, reload } = useData(async () => {
    const [leaves, types] = await Promise.all([
      must(supabase.from('leave_requests').select('*').eq('employee_id', employee!.id).order('start_date', { ascending: false })) as Promise<LeaveRequest[]>,
      fetchLeaveTypes(),
    ]);
    return { leaves, types };
  }, [employee?.id]);

  if (!employee) return null;
  const today = todayIST();
  const usage = (t: LeaveType, statuses: string[]) => (data?.leaves ?? [])
    .filter((l) => l.leave_type_id === t.id && statuses.includes(l.status) && l.start_date.startsWith(year))
    .reduce((s, l) => s + Number(l.days), 0);

  const doCancel = async () => {
    if (!cancel) return;
    try { await must(supabase.rpc('cancel_leave', { p_leave_id: cancel.id, p_reason: 'Cancelled by employee' })); toast('Leave cancelled'); setCancel(null); reload(); }
    catch (e) { toast(errMsg(e), 'error'); }
  };

  return (
    <>
      <PageHeader title="My Leaves" subtitle="Planned leave must be applied in advance and is only treated as leave once approved."
        actions={<Button icon={<CalendarPlus className="h-4 w-4" />} onClick={() => setApplying(true)}>Apply for leave</Button>} />
      {loading ? <Loading /> : error ? <Alert tone="error">{error}</Alert> : data && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data.types.filter((t) => t.is_active).map((t) => {
              const used = usage(t, ['approved']);
              const pending = usage(t, ['pending']);
              return (
                <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between"><p className="text-sm font-semibold">{t.name}</p><Badge tone={t.is_paid ? 'green' : 'grey'}>{t.is_paid ? 'paid' : 'unpaid'}</Badge></div>
                  {t.annual_quota != null ? (
                    <>
                      <p className="mt-2 text-2xl font-semibold">{Math.max(0, t.annual_quota - used - pending)}<span className="text-sm font-normal text-slate-500"> / {t.annual_quota} left</span></p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full bg-brand-500" style={{ width: `${Math.min(100, ((used + pending) / Math.max(1, t.annual_quota)) * 100)}%` }} />
                      </div>
                    </>
                  ) : <p className="mt-2 text-2xl font-semibold">{used}<span className="text-sm font-normal text-slate-500"> used</span></p>}
                  <p className="mt-1 text-xs text-slate-500">{used} approved · {pending} pending · {year}</p>
                </div>
              );
            })}
          </div>
          <Card title="My applications" bodyClassName="p-0">
            {!data.leaves.length ? <EmptyState title="You haven't applied for leave yet" /> : (
              <Table>
                <thead><tr><Th>Leave type</Th><Th>From</Th><Th>To</Th><Th>Days</Th><Th>Reason</Th><Th>Applied</Th><Th>Status</Th><Th /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.leaves.map((l) => (
                    <tr key={l.id} className="align-top">
                      <Td>{data.types.find((t) => t.id === l.leave_type_id)?.name}</Td>
                      <Td>{formatDate(l.start_date)}</Td><Td>{formatDate(l.end_date)}</Td><Td>{l.days}</Td>
                      <Td className="max-w-xs whitespace-normal">{l.reason}
                        {l.attachment_path && <button onClick={async () => { const u = await signedUrl('leave-attachments', l.attachment_path, 300); if (u) window.open(u, '_blank', 'noopener'); }} className="ml-2 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"><Paperclip className="h-3 w-3" />file</button>}
                        {l.admin_comment && <p className="mt-1 text-xs text-slate-500">HR: {l.admin_comment}</p>}
                      </Td>
                      <Td className="text-xs text-slate-500">{formatDateTime(l.created_at)}</Td>
                      <Td><Badge tone={leaveStatusTone(l.status)}>{l.status}</Badge></Td>
                      <Td>{(l.status === 'pending' || (l.status === 'approved' && l.start_date > today)) && <Button size="sm" variant="ghost" onClick={() => setCancel(l)}>Cancel</Button>}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}
      {applying && data && <ApplyModal employee={employee} types={data.types.filter((t) => t.is_active)} onClose={() => setApplying(false)} onDone={() => { setApplying(false); reload(); }} />}
      {cancel && (
        <Modal open onClose={() => setCancel(null)} title="Cancel leave application" footer={<><Button variant="secondary" onClick={() => setCancel(null)}>Keep</Button><Button variant="danger" onClick={doCancel}>Cancel leave</Button></>}>
          <p className="text-sm text-slate-600">Cancel your leave from {formatDate(cancel.start_date)} to {formatDate(cancel.end_date)}?</p>
        </Modal>
      )}
    </>
  );
}

function ApplyModal({ employee, types, onClose, onDone }: { employee: Employee; types: LeaveType[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const first = types[0];
  const [typeId, setTypeId] = useState(first?.id ?? '');
  const type = types.find((t) => t.id === typeId);
  const minStart = addDays(todayIST(), type?.min_notice_days ?? 0);
  const [start, setStart] = useState(minStart);
  const [end, setEnd] = useState(minStart);
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (start < minStart) { setStart(minStart); if (end < minStart) setEnd(minStart); } }, [minStart]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!start || !end || end < start) { setDays(null); return; }
    supabase.rpc('count_leave_days', { p_employee_id: employee.id, p_start: start, p_end: end }).then(({ data }) => setDays(data == null ? null : Number(data)));
  }, [start, end, employee.id]);

  const submit = async () => {
    setErr(null);
    if (!type) return setErr('Select a leave type');
    if (end < start) return setErr('End date cannot be before start date');
    if (start < minStart) return setErr(`${type.name} must be applied at least ${type.min_notice_days} day(s) in advance`);
    if (reason.trim().length < 3) return setErr('Please give a reason');
    if (days === 0) return setErr('The selected dates have no working days');
    setBusy(true);
    try {
      let attachment_path: string | null = null;
      if (file) {
        if (file.size > 5 * 1024 * 1024) throw new Error('Attachment must be under 5 MB');
        const path = `${employee.id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
        const { error } = await supabase.storage.from('leave-attachments').upload(path, file, { contentType: file.type });
        if (error) throw error;
        attachment_path = path;
      }
      await must(supabase.from('leave_requests').insert({
        employee_id: employee.id, leave_type_id: type.id, start_date: start, end_date: end, reason: reason.trim(), attachment_path,
      }));
      toast('Leave application submitted for approval');
      onDone();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="Apply for leave" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Submit application</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Leave type" required className="sm:col-span-2" hint={type ? `${type.is_paid ? 'Paid' : 'Unpaid'} · ${type.min_notice_days ? `apply ${type.min_notice_days} day(s) in advance` : 'can be applied for today'}${type.description ? ` · ${type.description}` : ''}` : undefined}>
          <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Leave start date" required><Input type="date" value={start} min={minStart} onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} /></Field>
        <Field label="Leave end date" required><Input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></Field>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm sm:col-span-2">
          Number of leave days: <b>{days ?? '—'}</b> <span className="text-xs text-slate-500">(weekly offs and holidays are not counted)</span>
        </div>
        <Field label="Reason" required className="sm:col-span-2"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <Field label="Attachment (optional)" className="sm:col-span-2" hint="PDF or image, max 5 MB (e.g. medical certificate)">
          <Input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
      </div>
      {err && <Alert tone="error" className="mt-3">{err}</Alert>}
    </Modal>
  );
}
