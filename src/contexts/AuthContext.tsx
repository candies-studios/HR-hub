import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { employeeLoginEmail, errMsg, supabase } from '../lib/supabase';
import type { Employee, OrgSettings, Profile } from '../lib/types';

const SESSION_KEY = 'hr-portal-attendance-session';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  employee: Employee | null;
  settings: OrgSettings | null;
  loading: boolean;
  signInEmployee: (employeeCode: string, password: string) => Promise<Profile>;
  signInAdmin: (email: string, password: string) => Promise<Profile>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  /** record a sign-in for today without re-authenticating (used when a session survived overnight) */
  markSignIn: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

async function loadProfile(userId: string) {
  const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  let employee: Employee | null = null;
  if (profile?.employee_id) {
    const { data } = await supabase.from('employees').select('*').eq('id', profile.employee_id).maybeSingle();
    employee = data as Employee | null;
  }
  const { data: settings } = await supabase.from('org_settings').select('*').eq('id', 1).maybeSingle();
  return { profile: profile as Profile | null, employee, settings: settings as OrgSettings | null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedFor = useRef<string | null>(null);

  const hydrate = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) {
      loadedFor.current = null;
      setProfile(null); setEmployee(null); setSettings(null);
      setLoading(false);
      return;
    }
    try {
      const r = await loadProfile(s.user.id);
      loadedFor.current = s.user.id;
      setProfile(r.profile); setEmployee(r.employee); setSettings(r.settings);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => hydrate(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // defer: calling supabase inside this callback can deadlock the auth client
      if (event === 'TOKEN_REFRESHED' && s?.user.id === loadedFor.current) { setSession(s); return; }
      setTimeout(() => hydrate(s), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [hydrate]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await hydrate(data.session);
  }, [hydrate]);

  const markSignIn = useCallback(async () => {
    const { data, error } = await supabase.rpc('employee_sign_in', { p_user_agent: navigator.userAgent });
    if (error) throw new Error(errMsg(error));
    if (data?.session_id) localStorage.setItem(SESSION_KEY, data.session_id);
  }, []);

  const signInEmployee = useCallback(async (code: string, password: string) => {
    const normalized = code.trim().toUpperCase();
    if (!/^CAN\d{3,}$/.test(normalized)) throw new Error('Enter a valid Employee ID, e.g. CAN001');
    const { data, error } = await supabase.auth.signInWithPassword({ email: employeeLoginEmail(normalized), password });
    if (error) {
      if (/banned/i.test(error.message)) throw new Error('Your account is inactive. Please contact HR.');
      throw new Error('Invalid Employee ID or password');
    }
    const r = await loadProfile(data.user.id);
    if (r.profile?.role !== 'employee') {
      await supabase.auth.signOut();
      throw new Error('This login is for employees only');
    }
    // Attendance: the login itself is the sign-in (time is taken on the server, IST rules)
    try { await markSignIn(); } catch (e) { console.error('attendance sign-in failed', e); }
    await hydrate(data.session);
    return r.profile;
  }, [hydrate, markSignIn]);

  const signInAdmin = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error('Invalid e-mail or password');
    const r = await loadProfile(data.user.id);
    if (r.profile?.role !== 'admin') {
      await supabase.auth.signOut();
      throw new Error('This account does not have administrator access');
    }
    await hydrate(data.session);
    return r.profile;
  }, [hydrate]);

  const signOut = useCallback(async () => {
    if (profile?.role === 'employee') {
      const sid = localStorage.getItem(SESSION_KEY);
      try { await supabase.rpc('employee_sign_out', { p_session_id: sid }); } catch { /* still log out */ }
    }
    localStorage.removeItem(SESSION_KEY);
    await supabase.auth.signOut();
  }, [profile]);

  return (
    <Ctx.Provider value={{ session, profile, employee, settings, loading, signInEmployee, signInAdmin, signOut, refresh, markSignIn }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside AuthProvider');
  return c;
}
