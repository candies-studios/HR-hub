import { Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Field, Input } from '../components/ui';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { dobToPassword } from '../lib/dates';
import { errMsg, supabase } from '../lib/supabase';

export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const { employee, refresh } = useAuth();
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rules = [
    { ok: pw.length >= 8, label: 'At least 8 characters' },
    { ok: /[A-Za-z]/.test(pw) && /\d/.test(pw), label: 'Contains letters and numbers' },
    { ok: !employee || pw !== dobToPassword(employee.date_of_birth), label: 'Not your date of birth' },
    { ok: pw.length > 0 && pw === pw2, label: 'Both entries match' },
  ];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (rules.some((r) => !r.ok)) { setError('Please meet all password requirements.'); return; }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: pw });
      if (err) throw err;
      await refresh();
      toast('Password changed successfully');
      setPw(''); setPw2('');
      onDone?.();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="New password" required>
        <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
      </Field>
      <Field label="Confirm new password" required>
        <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
      </Field>
      <ul className="space-y-1 text-xs">
        {rules.map((r) => (
          <li key={r.label} className={r.ok ? 'text-emerald-600' : 'text-slate-500'}>{r.ok ? '✓' : '•'} {r.label}</li>
        ))}
      </ul>
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" loading={busy} icon={<Lock className="h-4 w-4" />} className="w-full">Change password</Button>
    </form>
  );
}

export function ForcedChangePassword() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-brand-950 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-lg bg-brand-50 p-2 text-brand-600"><Lock className="h-5 w-5" /></div>
          <div>
            <h1 className="text-lg font-semibold">Set a new password</h1>
            <p className="text-xs text-slate-500">For security, your date-of-birth password must be changed before you continue.</p>
          </div>
        </div>
        <ChangePasswordForm onDone={() => navigate(profile?.role === 'admin' ? '/admin' : '/app', { replace: true })} />
        <button onClick={async () => { await signOut(); navigate('/login'); }} className="mt-4 w-full text-center text-xs text-slate-500 hover:underline">
          Sign out
        </button>
      </div>
    </div>
  );
}
