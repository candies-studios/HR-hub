import {
  BarChart3, CalendarCheck, CalendarDays, ClipboardList, FileText, Gavel, History, LayoutDashboard, Palmtree,
  Settings as SettingsIcon, UserRound, Users, Wallet,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Button, Loading } from './components/ui';
import { ToastProvider, useToast } from './components/Toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppShell, type NavItem } from './layouts/AppShell';
import { supabase } from './lib/supabase';
import { todayIST } from './lib/dates';
import { AdminLogin, EmployeeLogin } from './pages/Login';
import { ForcedChangePassword } from './pages/ChangePassword';
import AdminDashboard from './pages/admin/Dashboard';
import Employees from './pages/admin/Employees';
import EmployeeForm from './pages/admin/EmployeeForm';
import EmployeeDetail from './pages/admin/EmployeeDetail';
import AttendancePage from './pages/admin/Attendance';
import LeavesPage from './pages/admin/Leaves';
import HolidaysPage from './pages/admin/Holidays';
import PenaltiesPage from './pages/admin/Penalties';
import PayrollPage from './pages/admin/Payroll';
import ReportsPage from './pages/admin/Reports';
import SettingsPage from './pages/admin/Settings';
import AuditPage from './pages/admin/Audit';
import EmployeeDashboard from './pages/employee/Dashboard';
import MyAttendance from './pages/employee/MyAttendance';
import MyLeaves from './pages/employee/MyLeaves';
import MySalary from './pages/employee/MySalary';
import Policy from './pages/employee/Policy';
import MyProfile from './pages/employee/Profile';

const adminNav: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/employees', label: 'Employees', icon: Users },
  { to: '/admin/attendance', label: 'Attendance', icon: CalendarCheck },
  { to: '/admin/leaves', label: 'Leave Requests', icon: ClipboardList },
  { to: '/admin/holidays', label: 'Holidays & Leave Policy', icon: Palmtree },
  { to: '/admin/penalties', label: 'Penalties', icon: Gavel },
  { to: '/admin/payroll', label: 'Payroll & Salary Slips', icon: Wallet },
  { to: '/admin/reports', label: 'Reports & Export', icon: BarChart3 },
  { to: '/admin/audit', label: 'Audit Log', icon: History },
  { to: '/admin/settings', label: 'Settings', icon: SettingsIcon },
];

const employeeNav: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/attendance', label: 'My Attendance', icon: CalendarDays },
  { to: '/app/leaves', label: 'My Leaves', icon: ClipboardList },
  { to: '/app/salary', label: 'Salary & Slips', icon: FileText },
  { to: '/app/policy', label: 'Leave Policy & Holidays', icon: Palmtree },
  { to: '/app/profile', label: 'My Profile', icon: UserRound },
];

function RequireRole({ role, children }: { role: 'admin' | 'employee'; children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading label="Checking session…" />;
  const loginPath = role === 'admin' ? '/admin/login' : '/login';
  if (!session || !profile) return <Navigate to={loginPath} replace state={{ from: loc.pathname }} />;
  if (profile.role !== role) return <Navigate to={profile.role === 'admin' ? '/admin' : '/app'} replace />;
  if (profile.must_change_password) return <Navigate to="/change-password" replace />;
  return <>{children}</>;
}

/** Shown when an employee's session survived from an earlier day and today's sign-in is missing */
function SignInBanner() {
  const { employee, markSignIn } = useAuth();
  const toast = useToast();
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!employee) return;
    supabase.from('attendance').select('id').eq('employee_id', employee.id).eq('work_date', todayIST()).maybeSingle()
      .then(({ data }) => setMissing(!data));
  }, [employee]);
  if (!missing) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
      Your attendance for today has not been recorded yet.
      <Button size="sm" loading={busy} onClick={async () => {
        setBusy(true);
        try { await markSignIn(); setMissing(false); toast('Signed in for today'); window.dispatchEvent(new Event('attendance-updated')); }
        catch (e) { toast((e as Error).message, 'error'); }
        finally { setBusy(false); }
      }}>Sign in for today</Button>
    </div>
  );
}

function AdminShell() {
  const { profile, session } = useAuth();
  return <AppShell nav={adminNav} title="Admin Console" userLabel={profile?.display_name || 'Administrator'} userSub={session?.user.email} />;
}
function EmployeeShell() {
  const { employee } = useAuth();
  return (
    <AppShell
      nav={employeeNav}
      title="Employee Portal"
      userLabel={employee?.full_name ?? 'Employee'}
      userSub={employee ? `${employee.employee_code} · ${employee.designation}` : undefined}
      banner={<SignInBanner />}
    />
  );
}

function HomeRedirect() {
  const { session, profile, loading } = useAuth();
  if (loading) return <Loading />;
  if (!session || !profile) return <Navigate to="/login" replace />;
  return <Navigate to={profile.role === 'admin' ? '/admin' : '/app'} replace />;
}

function ChangePasswordRoute() {
  const { session, loading } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  return <ForcedChangePassword />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/login" element={<EmployeeLogin />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/change-password" element={<ChangePasswordRoute />} />

            <Route path="/admin" element={<RequireRole role="admin"><AdminShell /></RequireRole>}>
              <Route index element={<AdminDashboard />} />
              <Route path="employees" element={<Employees />} />
              <Route path="employees/new" element={<EmployeeForm />} />
              <Route path="employees/:id" element={<EmployeeDetail />} />
              <Route path="employees/:id/edit" element={<EmployeeForm />} />
              <Route path="attendance" element={<AttendancePage />} />
              <Route path="leaves" element={<LeavesPage />} />
              <Route path="holidays" element={<HolidaysPage />} />
              <Route path="penalties" element={<PenaltiesPage />} />
              <Route path="payroll" element={<PayrollPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="audit" element={<AuditPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>

            <Route path="/app" element={<RequireRole role="employee"><EmployeeShell /></RequireRole>}>
              <Route index element={<EmployeeDashboard />} />
              <Route path="attendance" element={<MyAttendance />} />
              <Route path="leaves" element={<MyLeaves />} />
              <Route path="salary" element={<MySalary />} />
              <Route path="policy" element={<Policy />} />
              <Route path="profile" element={<MyProfile />} />
            </Route>

            <Route path="*" element={<HomeRedirect />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
