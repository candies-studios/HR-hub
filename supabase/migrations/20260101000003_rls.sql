-- =====================================================================
-- HR PORTAL - ROW LEVEL SECURITY
-- Employees can only ever see rows that belong to themselves.
-- Sensitive writes (attendance, leave decisions, payroll unlock) are
-- only possible through SECURITY DEFINER functions that validate input.
-- =====================================================================

alter table public.org_settings        enable row level security;
alter table public.employees           enable row level security;
alter table public.profiles            enable row level security;
alter table public.salary_revisions    enable row level security;
alter table public.attendance          enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_history  enable row level security;
alter table public.leave_types         enable row level security;
alter table public.leave_requests      enable row level security;
alter table public.holidays            enable row level security;
alter table public.holiday_employees   enable row level security;
alter table public.default_holidays    enable row level security;
alter table public.penalties           enable row level security;
alter table public.salary_adjustments  enable row level security;
alter table public.payroll_records     enable row level security;
alter table public.audit_logs          enable row level security;

-- org_settings ---------------------------------------------------------
create policy "settings: read for signed-in users" on public.org_settings
  for select to authenticated using (true);
create policy "settings: admin update" on public.org_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- employees ------------------------------------------------------------
create policy "employees: admin all / self read" on public.employees
  for select to authenticated using (public.is_admin() or id = public.my_employee_id());
create policy "employees: admin insert" on public.employees
  for insert to authenticated with check (public.is_admin());
create policy "employees: admin update" on public.employees
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- no delete policy: employees are deactivated, never deleted from the UI

-- Columns that must only be changed by the admin-employees edge function
-- (it also bans/unbans the login), so block them for normal clients.
create or replace function public.employees_protect_columns()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    if new.employee_code is distinct from old.employee_code
       or new.auth_user_id is distinct from old.auth_user_id
       or new.status is distinct from old.status
       or new.inactive_from is distinct from old.inactive_from then
      raise exception 'Employee ID, login and status can only be changed through the employee management actions';
    end if;
  end if;
  return new;
end $$;
create trigger employees_protect before update on public.employees
  for each row execute function public.employees_protect_columns();

-- profiles -------------------------------------------------------------
create policy "profiles: self or admin read" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
-- no client writes; profiles are created by the edge function / make_admin()

-- salary_revisions -----------------------------------------------------
create policy "salary: admin all / self read" on public.salary_revisions
  for select to authenticated using (public.is_admin() or employee_id = public.my_employee_id());
create policy "salary: admin insert" on public.salary_revisions
  for insert to authenticated with check (public.is_admin());
create policy "salary: admin update" on public.salary_revisions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "salary: admin delete" on public.salary_revisions
  for delete to authenticated using (public.is_admin());

-- attendance (read only - writes go through functions) ------------------
create policy "attendance: admin all / self read" on public.attendance
  for select to authenticated using (public.is_admin() or employee_id = public.my_employee_id());
create policy "sessions: admin all / self read" on public.attendance_sessions
  for select to authenticated using (public.is_admin() or employee_id = public.my_employee_id());
create policy "attendance history: admin / self read" on public.attendance_history
  for select to authenticated using (public.is_admin() or employee_id = public.my_employee_id());

-- leave types ----------------------------------------------------------
create policy "leave types: read" on public.leave_types
  for select to authenticated using (true);
create policy "leave types: admin insert" on public.leave_types
  for insert to authenticated with check (public.is_admin());
create policy "leave types: admin update" on public.leave_types
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "leave types: admin delete" on public.leave_types
  for delete to authenticated using (public.is_admin());

-- leave requests -------------------------------------------------------
create policy "leaves: admin all / self read" on public.leave_requests
  for select to authenticated using (public.is_admin() or employee_id = public.my_employee_id());
create policy "leaves: apply for self (or admin)" on public.leave_requests
  for insert to authenticated with check (public.is_admin() or employee_id = public.my_employee_id());
-- status changes only via admin_review_leave() / cancel_leave()

-- holidays -------------------------------------------------------------
create policy "holidays: read applicable" on public.holidays
  for select to authenticated using (
    public.is_admin() or applies_to_all
    or exists (select 1 from public.holiday_employees he
               where he.holiday_id = holidays.id and he.employee_id = public.my_employee_id()));
create policy "holidays: admin insert" on public.holidays
  for insert to authenticated with check (public.is_admin());
create policy "holidays: admin update" on public.holidays
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "holidays: admin delete" on public.holidays
  for delete to authenticated using (public.is_admin());

create policy "holiday employees: read" on public.holiday_employees
  for select to authenticated using (public.is_admin() or employee_id = public.my_employee_id());
create policy "holiday employees: admin insert" on public.holiday_employees
  for insert to authenticated with check (public.is_admin());
create policy "holiday employees: admin delete" on public.holiday_employees
  for delete to authenticated using (public.is_admin());

create policy "default holidays: admin read" on public.default_holidays
  for select to authenticated using (public.is_admin());

-- penalties ------------------------------------------------------------
create policy "penalties: admin all / self read" on public.penalties
  for select to authenticated using (public.is_admin() or employee_id = public.my_employee_id());
create policy "penalties: admin insert" on public.penalties
  for insert to authenticated with check (public.is_admin());
create policy "penalties: admin update" on public.penalties
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "penalties: admin delete" on public.penalties
  for delete to authenticated using (public.is_admin());

-- salary adjustments ---------------------------------------------------
create policy "adjustments: admin all / self read" on public.salary_adjustments
  for select to authenticated using (public.is_admin() or employee_id = public.my_employee_id());
create policy "adjustments: admin insert" on public.salary_adjustments
  for insert to authenticated with check (public.is_admin());
create policy "adjustments: admin delete" on public.salary_adjustments
  for delete to authenticated using (public.is_admin());

-- payroll records ------------------------------------------------------
create policy "payroll: admin all / self read" on public.payroll_records
  for select to authenticated using (public.is_admin() or employee_id = public.my_employee_id());
create policy "payroll: admin finalise" on public.payroll_records
  for insert to authenticated with check (public.is_admin());
-- delete only via unlock_payroll(); no update - snapshots are immutable

-- audit ----------------------------------------------------------------
create policy "audit: admin read" on public.audit_logs
  for select to authenticated using (public.is_admin());

-- =====================================================================
-- STORAGE (private buckets, signed URLs)
--   avatars/<employee_uuid>/<file>
--   leave-attachments/<employee_uuid>/<file>
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', false, 2097152),
       ('leave-attachments', 'leave-attachments', false, 5242880)
on conflict (id) do nothing;

create policy "avatars: admin manage" on storage.objects
  for all to authenticated
  using (bucket_id = 'avatars' and public.is_admin())
  with check (bucket_id = 'avatars' and public.is_admin());
create policy "avatars: employee read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = public.my_employee_id()::text);

create policy "leave files: admin read" on storage.objects
  for select to authenticated
  using (bucket_id = 'leave-attachments' and public.is_admin());
create policy "leave files: employee read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'leave-attachments' and (storage.foldername(name))[1] = public.my_employee_id()::text);
create policy "leave files: employee upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'leave-attachments' and (storage.foldername(name))[1] = public.my_employee_id()::text);
