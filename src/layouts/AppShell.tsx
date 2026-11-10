import { clsx } from 'clsx';
import { LogOut, Menu, X, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Avatar } from '../components/ui';
import { useToast } from '../components/Toast';
import { asset } from '../lib/format';

export interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }

export function AppShell({ nav, title, userLabel, userSub, banner }: {
  nav: NavItem[]; title: string; userLabel: string; userSub?: string; banner?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { signOut, settings, profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    setBusy(true);
    await signOut();
    toast(profile?.role === 'employee' ? 'Signed out – your sign-out time has been recorded' : 'Signed out', 'info');
    navigate(profile?.role === 'admin' ? '/admin/login' : '/login', { replace: true });
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <img src={asset('logo-mark.png')} alt="" className="h-9 w-9 shrink-0 rounded-full bg-white" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{settings?.company_name ?? 'Candies Studios'}</p>
          <p className="text-xs text-slate-400">{title}</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white',
              )
            }
          >
            <n.icon className="h-4 w-4 shrink-0" /> {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar name={userLabel} size={34} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{userLabel}</p>
            {userSub && <p className="truncate text-xs text-slate-400">{userSub}</p>}
          </div>
        </div>
        <button
          onClick={logout}
          disabled={busy}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" /> {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-slate-900 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-slate-900 shadow-xl">
            <button className="absolute right-3 top-5 text-slate-400" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <img src={asset('logo-mark.png')} alt="" className="h-7 w-7 rounded-full" />
          <p className="text-sm font-semibold">{settings?.company_name ?? 'Candies Studios'}</p>
        </header>
        {banner}
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
