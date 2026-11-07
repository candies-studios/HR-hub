import { History, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { formatDate, formatDateTime, formatTime, istToISO, toISTTimeInput } from '../lib/dates';
import { errMsg, must, supabase } from '../lib/supabase';
import type { Attendance, AttendanceHistory, AttendanceSession, AttendanceStatus } from '../lib/types';
import { Alert, Badge, Button, Checkbox, Field, Input, Modal, Select, Textarea } from './ui';
import { useToast } from './Toast';

export interface AttendanceTarget {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  date: string;
  record?: Attendance | null;
}

const HHMM = (t: string) => t.slice(0, 5);
const addMinutes = (hhmm: string, mins: number) => {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

export function AttendanceEditModal({ target, onClose, onSaved }: { target: AttendanceTarget | null; onClose: () => void; onSaved: () => void }) {
  const { settings } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<AttendanceStatus>('present');
  const [inT, setInT] = useState('');
  const [outT, setOutT] = useState('');
  const [exception, setException] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<AttendanceHistory[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!target) return;
    const r = target.record;
    setStatus(r?.status ?? 'present');
    setInT(toISTTimeInput(r?.sign_in_at));
    setOutT(toISTTimeInput(r?.sign_out_at));
    setException(r?.late_exception ?? false);
    setRemarks(r?.remarks ?? '');
    setReason('');
    setError(null);
    setConfirmDelete(false);
    supabase.from('attendance_history').select('*').eq('employee_id', target.employeeId).eq('work_date', target.date)
      .order('changed_at', { ascending: false }).then(({ data }) => setHistory((data as AttendanceHistory[]) ?? []));
    if (r) supabase.from('attendance_sessions').select('*').eq('attendance_id', r.id).order('login_at')
      .then(({ data }) => setSessions((data as AttendanceSession[]) ?? []));
    else setSessions([]);
  }, [target]);

  if (!target) return null;
  const cutoff = settings ? addMinutes(HHMM(settings.reporting_time), settings.grace_minutes) : '10:00';
  const isLate = Boolean(inT) && inT > cutoff;

  const onInChange = (v: string) => {
    setInT(v);
    // auto-suggest status from the attendance rule
    if (v && status !== 'absent' && settings?.late_marks_half_day) setStatus(v > cutoff && !exception ? 'half_day' : 'present');
  };

  const save = async () => {
    setError(null);
    if (reason.trim().length < 3) { setError('Please enter a reason for this change (mandatory).'); return; }
    if (inT && outT && outT < inT) { setError('Sign-out time cannot be before sign-in time.'); return; }
    setBusy(true);
    try {
      await must(supabase.rpc('admin_save_attendance', {
        p_employee_id: target.employeeId,
        p_work_date: target.date,
        p_status: status,
        p_sign_in_at: status === 'absent' ? null : istToISO(target.date, inT),
        p_sign_out_at: status === 'absent' ? null : istToISO(target.date, outT),
        p_late_exception: isLate && exception,
        p_remarks: remarks.trim() || null,
        p_reason: reason.trim(),
      }));
      toast('Attendance saved');
      onSaved();
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (reason.trim().length < 3) { setError('Enter a reason before deleting the record.'); return; }
    setBusy(true);
    try {
      await must(supabase.rpc('admin_delete_attendance', { p_attendance_id: target.record!.id, p_reason: reason.trim() }));
      toast('Attendance record removed');
      onSaved();
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={<>{target.record ? 'Edit' : 'Mark'} attendance · {target.employeeName} <span className="font-mono text-xs text-slate-500">({target.employeeCode})</span> · {formatDate(target.date)}</>}
      footer={<>
        {target.record && (confirmDelete
          ? <Button variant="danger" loading={busy} onClick={remove} icon={<Trash2 className="h-4 w-4" />}>Confirm delete</Button>
          : <Button variant="ghost" className="mr-auto text-red-600" onClick={() => setConfirmDelete(true)} icon={<Trash2 className="h-4 w-4" />}>Delete record</Button>)}
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={busy} onClick={save}>Save</Button>
      </>}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Status" required>
          <Select value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus)}>
            <option value="present">Present (full day)</option>
            <option value="half_day">Half day</option>
            <option value="absent">Absent</option>
          </Select>
        </Field>
        <Field label="Sign-in time (IST)"><Input type="time" value={inT} onChange={(e) => onInChange(e.target.value)} disabled={status === 'absent'} /></Field>
        <Field label="Sign-out time (IST)"><Input type="time" value={outT} onChange={(e) => setOutT(e.target.value)} disabled={status === 'absent'} /></Field>
      </div>

      {isLate && status !== 'absent' && (
        <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-3">
          <p className="mb-2 text-sm text-orange-800">Late arrival – signed in after {cutoff} IST. By rule this is a half day.</p>
          <Checkbox
            checked={exception}
            onChange={(v) => { setException(v); setStatus(v ? 'present' : 'half_day'); }}
            label={<span>Approve late arrival as an <b>exception</b> (count as full day, no half-day deduction)</span>}
          />
        </div>
      )}

      <div className="mt-4 grid gap-4">
        <Field label="Remarks (visible to employee)"><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Client visit" /></Field>
        <Field label="Reason for change" required hint="Stored in the attendance modification history."><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></Field>
      </div>
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}

      {sessions.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Login sessions</p>
          <ul className="space-y-1 text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap gap-2 text-slate-600">
                <span>In {formatTime(s.login_at)}</span>→<span>{s.logout_at ? `Out ${formatTime(s.logout_at)}` : <Badge tone="orange">no logout</Badge>}</span>
                {s.closed_by === 'admin' && <Badge>closed by admin</Badge>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500"><History className="h-3.5 w-3.5" /> Modification history</p>
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand">{h.action.replace(/_/g, ' ')}</Badge>
                  <span className="text-xs text-slate-500">{formatDateTime(h.changed_at)}</span>
                </div>
                <p className="mt-1 text-slate-700">
                  {h.old_data?.status && <>{h.old_data.status} → </>}{h.new_data?.status ?? 'deleted'} · <i>{h.reason}</i>
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
