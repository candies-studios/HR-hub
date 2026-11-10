import { Eye, EyeOff, KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Field, Input } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { officeHours } from '../lib/dates';
import { asset } from '../lib/format';

function Shell({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-brand-950 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-5 inline-flex rounded-2xl bg-white px-6 py-4 shadow-lg">
            <img src={asset('logo.png')} alt="Candies Studios" className="h-9 w-auto" />
          </div>
          <h1 className="flex items-center justify-center gap-2 text-xl font-semibold text-white">
            {admin && <ShieldCheck className="h-5 w-5 text-brand-300" />}{admin ? 'Administrator Login' : 'Employee Login'}
          </h1>
          <p className="mt-1 text-sm text-slate-400">Candies Studios · HR, Attendance & Payroll Portal</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-2xl">
          {!supabaseConfigured && (
            <Alert tone="warn" className="mb-4">Supabase is not configured. Copy <code>.env.example</code> to <code>.env</code> and add your project URL and anon key.</Alert>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="current-password" required className="pr-10" />
      <button type="button" onClick={() => setShow(!show)} className="absolute inset-y-0 right-0 px-3 text-slate-400 hover:text-slate-600" aria-label="Toggle password visibility">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function EmployeeLogin() {
  const { signInEmployee } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hours, setHours] = useState(officeHours(null));
  useEffect(() => {
    supabase.from('org_settings').select('reporting_time, office_end_time').eq('id', 1).maybeSingle()
      .then(({ data }) => data && setHours(officeHours(data)));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const profile = await signInEmployee(code, password);
      navigate(profile.must_change_password ? '/change-password' : '/app', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Employee ID">
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CAN001" autoComplete="username" required className="pl-9 uppercase" autoFocus />
          </div>
        </Field>
        <Field label="Password" hint="First login: your date of birth as DDMMYYYY">
          <PasswordInput value={password} onChange={setPassword} placeholder="DDMMYYYY" />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" loading={busy} className="w-full" icon={<KeyRound className="h-4 w-4" />}>Sign in</Button>
        <p className="text-center text-xs text-slate-500">Signing in records your attendance for today. Office hours {hours}.</p>
      </form>
      <div className="mt-5 border-t border-slate-100 pt-4 text-center">
        <Link to="/admin/login" className="text-xs font-medium text-brand-600 hover:underline">Administrator login →</Link>
      </div>
    </Shell>
  );
}

export function AdminLogin() {
  const { signInAdmin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signInAdmin(email, password);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell admin>
      <form onSubmit={submit} className="space-y-4">
        <Field label="E-mail">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </Field>
        <Field label="Password">
          <PasswordInput value={password} onChange={setPassword} />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" loading={busy} className="w-full" icon={<ShieldCheck className="h-4 w-4" />}>Sign in as admin</Button>
      </form>
      <div className="mt-5 border-t border-slate-100 pt-4 text-center">
        <Link to="/login" className="text-xs font-medium text-brand-600 hover:underline">← Employee login</Link>
      </div>
    </Shell>
  );
}
