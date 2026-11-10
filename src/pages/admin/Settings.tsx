import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '../../components/Toast';
import { Alert, Button, Card, Checkbox, Field, Input, Loading, PageHeader, Select, Textarea } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { WEEKDAYS } from '../../lib/dates';
import { errMsg, must, supabase } from '../../lib/supabase';
import { ChangePasswordForm } from '../ChangePassword';

export default function SettingsPage() {
  const { settings, refresh } = useAuth();
  const toast = useToast();
  const [f, setF] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setF(settings), [settings]);
  if (!f) return <Loading />;

  const toggleDay = (d: number, on: boolean) =>
    setF({ ...f, weekly_off_days: on ? [...new Set([...f.weekly_off_days, d])].sort() : f.weekly_off_days.filter((x) => x !== d) });

  const save = async () => {
    if (!f.company_name.trim()) return setErr('Company name is required');
    setBusy(true); setErr(null);
    try {
      await must(supabase.from('org_settings').update({
        company_name: f.company_name.trim(), company_address: f.company_address.trim(), reporting_time: f.reporting_time, office_end_time: f.office_end_time,
        grace_minutes: Number(f.grace_minutes) || 0, late_marks_half_day: f.late_marks_half_day,
        weekly_off_days: f.weekly_off_days, weekly_off_paid: f.weekly_off_paid,
      }).eq('id', 1));
      await refresh();
      toast('Settings saved');
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Organisation details and attendance / payroll rules." actions={<Button icon={<Save className="h-4 w-4" />} loading={busy} onClick={save}>Save settings</Button>} />
      {err && <Alert tone="error" className="mb-4">{err}</Alert>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Organisation (shown on salary slips)">
          <div className="grid gap-4">
            <Field label="Company name" required><Input value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} /></Field>
            <Field label="Address"><Textarea value={f.company_address} onChange={(e) => setF({ ...f, company_address: e.target.value })} /></Field>
          </div>
        </Card>
        <Card title="Attendance rules (IST)">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Login time (reporting time)" hint="Sign-in at or before this time = full day"><Input type="time" value={f.reporting_time.slice(0, 5)} onChange={(e) => setF({ ...f, reporting_time: e.target.value })} /></Field>
            <Field label="Logout time (office end time)" hint="Shown to employees. If someone forgets to log out, this time is recorded as their sign-out."><Input type="time" value={(f.office_end_time ?? '18:30').slice(0, 5)} onChange={(e) => setF({ ...f, office_end_time: e.target.value })} /></Field>
            <Field label="Grace period (minutes)" hint="0 = strictly at reporting time"><Input type="number" min="0" max="240" value={f.grace_minutes} onChange={(e) => setF({ ...f, grace_minutes: Number(e.target.value) })} /></Field>
            <div className="sm:col-span-2"><Checkbox checked={f.late_marks_half_day} onChange={(v) => setF({ ...f, late_marks_half_day: v })} label="Late sign-in is automatically marked as Half Day (half-day salary deduction)" /></div>
          </div>
        </Card>
        <Card title="Weekly offs & paid days">
          <p className="mb-3 text-sm text-slate-600">Weekly off days</p>
          <div className="mb-4 flex flex-wrap gap-4">
            {WEEKDAYS.map((d, i) => <Checkbox key={d} checked={f.weekly_off_days.includes(i)} onChange={(v) => toggleDay(i, v)} label={d} />)}
          </div>
          <Field label="Treatment of weekly offs in salary">
            <Select value={f.weekly_off_paid ? 'paid' : 'unpaid'} onChange={(e) => setF({ ...f, weekly_off_paid: e.target.value === 'paid' })}>
              <option value="paid">Paid – weekly offs count as payable days (standard monthly salary)</option>
              <option value="unpaid">Unpaid – only worked days / paid leave / paid holidays are paid</option>
            </Select>
          </Field>
          <p className="mt-3 text-xs text-slate-500">Public holidays are paid or unpaid individually on the Holidays page. Changes apply to all payroll months that are not yet finalised.</p>
        </Card>
        <Card title="Change my password"><div className="max-w-sm"><ChangePasswordForm /></div></Card>
      </div>
    </>
  );
}
