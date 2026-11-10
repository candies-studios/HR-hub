-- =====================================================================
-- HR PORTAL - CORE SCHEMA
-- All "business dates" (work_date, holiday_date, leave dates ...) are
-- calendar dates in Indian Standard Time (Asia/Kolkata).
-- Timestamps are stored as timestamptz (UTC internally).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Time helpers (IST)
-- ---------------------------------------------------------------------
create or replace function public.ist_today()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

-- ---------------------------------------------------------------------
-- Organisation settings (single row)
-- ---------------------------------------------------------------------
create table public.org_settings (
  id                  int primary key default 1 check (id = 1),
  company_name        text not null default 'Candies Studios',
  company_address     text not null default '',
  reporting_time      time not null default '10:00',
  grace_minutes       int  not null default 0 check (grace_minutes between 0 and 240),
  late_marks_half_day boolean not null default true,
  weekly_off_days     int[] not null default '{0}',      -- 0 = Sunday ... 6 = Saturday
  weekly_off_paid     boolean not null default true,     -- are weekly offs paid days?
  updated_at          timestamptz not null default now()
);
insert into public.org_settings (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------
-- Employees
-- ---------------------------------------------------------------------
create sequence public.employee_code_seq start 1;

create table public.employees (
  id                    uuid primary key default gen_random_uuid(),
  employee_code         text not null unique check (employee_code ~ '^CAN[0-9]{3,}$'),
  full_name             text not null check (length(trim(full_name)) > 1),
  date_of_birth         date not null,
  email                 text,
  phone                 text not null,
  alt_phone             text,
  alt_contact_relation  text,
  blood_group           text check (blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  date_of_joining       date not null,
  designation           text not null,
  photo_path            text,
  status                text not null default 'active' check (status in ('active','inactive')),
  inactive_from         date,
  auth_user_id          uuid unique references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (date_of_birth < date_of_joining)
);
create unique index employees_email_uq on public.employees (lower(email)) where email is not null and email <> '';
create index employees_status_idx on public.employees (status);

-- ---------------------------------------------------------------------
-- Profiles (role mapping for auth users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  role                  text not null check (role in ('admin','employee')),
  employee_id           uuid unique references public.employees(id) on delete cascade,
  display_name          text,
  must_change_password  boolean not null default false,
  created_at            timestamptz not null default now(),
  check ((role = 'employee') = (employee_id is not null))
);

-- ---------------------------------------------------------------------
-- Salary revisions (effective-dated, never overwritten)
-- ---------------------------------------------------------------------
create table public.salary_revisions (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employees(id) on delete cascade,
  monthly_salary  numeric(12,2) not null check (monthly_salary > 0),
  effective_date  date not null,
  reason          text,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  unique (employee_id, effective_date)
);
create index salary_revisions_emp_idx on public.salary_revisions (employee_id, effective_date desc);

-- ---------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------
create table public.attendance (
  id                     uuid primary key default gen_random_uuid(),
  employee_id            uuid not null references public.employees(id) on delete cascade,
  work_date              date not null,
  status                 text not null check (status in ('present','half_day','absent')),
  sign_in_at             timestamptz,
  sign_out_at            timestamptz,
  total_minutes          int not null default 0,
  is_late                boolean not null default false,
  late_minutes           int not null default 0,
  late_exception         boolean not null default false,
  late_exception_reason  text,
  late_exception_by      uuid,
  late_exception_at      timestamptz,
  source                 text not null default 'portal' check (source in ('portal','admin')),
  remarks                text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (employee_id, work_date),
  check (sign_out_at is null or sign_in_at is null or sign_out_at >= sign_in_at)
);
create index attendance_date_idx on public.attendance (work_date);

create table public.attendance_sessions (
  id             uuid primary key default gen_random_uuid(),
  attendance_id  uuid not null references public.attendance(id) on delete cascade,
  employee_id    uuid not null references public.employees(id) on delete cascade,
  login_at       timestamptz not null default now(),
  logout_at      timestamptz,
  user_agent     text,
  closed_by      text check (closed_by in ('employee','admin'))
);
create index attendance_sessions_open_idx on public.attendance_sessions (employee_id) where logout_at is null;

create table public.attendance_history (
  id             uuid primary key default gen_random_uuid(),
  attendance_id  uuid,
  employee_id    uuid not null references public.employees(id) on delete cascade,
  work_date      date not null,
  action         text not null,
  old_data       jsonb,
  new_data       jsonb,
  reason         text,
  changed_by     uuid default auth.uid(),
  changed_at     timestamptz not null default now()
);
create index attendance_history_emp_idx on public.attendance_history (employee_id, work_date);

-- ---------------------------------------------------------------------
-- Leave policy
-- ---------------------------------------------------------------------
create table public.leave_types (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  name             text not null,
  is_paid          boolean not null default true,
  annual_quota     numeric(5,1),                 -- null = unlimited
  min_notice_days  int not null default 0 check (min_notice_days >= 0),
  description      text,
  is_active        boolean not null default true,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now()
);

create table public.leave_requests (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.employees(id) on delete cascade,
  leave_type_id    uuid not null references public.leave_types(id),
  start_date       date not null,
  end_date         date not null,
  days             numeric(5,1) not null default 0,
  reason           text not null check (length(trim(reason)) >= 3),
  attachment_path  text,
  status           text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  admin_comment    text,
  reviewed_by      uuid,
  reviewed_at      timestamptz,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  check (end_date >= start_date)
);
create index leave_requests_emp_idx on public.leave_requests (employee_id, start_date);
create index leave_requests_status_idx on public.leave_requests (status);

-- ---------------------------------------------------------------------
-- Holidays
-- ---------------------------------------------------------------------
create table public.holidays (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  holiday_date    date not null,
  category        text not null check (category in ('festival','national','state','optional')),
  is_paid         boolean not null default true,
  applies_to_all  boolean not null default true,
  description     text,
  created_at      timestamptz not null default now(),
  unique (holiday_date, name)
);
create index holidays_date_idx on public.holidays (holiday_date);

create table public.holiday_employees (
  holiday_id   uuid not null references public.holidays(id) on delete cascade,
  employee_id  uuid not null references public.employees(id) on delete cascade,
  primary key (holiday_id, employee_id)
);

-- Reference list the admin can review & import from (NOT applied automatically)
create table public.default_holidays (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  holiday_date  date not null,
  category      text not null check (category in ('festival','national','state','optional')),
  description   text,
  is_tentative  boolean not null default false,
  unique (holiday_date, name)
);

-- ---------------------------------------------------------------------
-- Penalties & adjustments
-- ---------------------------------------------------------------------
create table public.penalties (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references public.employees(id) on delete cascade,
  penalty_date      date not null,
  category          text not null default 'other'
                    check (category in ('late_coming','absence','misconduct','policy_violation','damage','performance','other')),
  penalty_type      text not null default 'financial' check (penalty_type in ('financial','warning')),
  reason            text not null check (length(trim(reason)) >= 3),
  amount            numeric(12,2) not null default 0 check (amount >= 0),
  deduction_year    int not null,
  deduction_month   int not null check (deduction_month between 1 and 12),
  status            text not null default 'active' check (status in ('active','waived')),
  waived_reason     text,
  notes             text,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  check (penalty_type = 'financial' or amount = 0),
  check (penalty_type = 'warning' or amount > 0)
);
create index penalties_emp_month_idx on public.penalties (employee_id, deduction_year, deduction_month);

create table public.salary_adjustments (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  year         int not null,
  month        int not null check (month between 1 and 12),
  adj_type     text not null check (adj_type in ('addition','deduction')),
  amount       numeric(12,2) not null check (amount > 0),
  reason       text not null check (length(trim(reason)) >= 3),
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index salary_adjustments_emp_month_idx on public.salary_adjustments (employee_id, year, month);

-- ---------------------------------------------------------------------
-- Finalised payroll snapshots (salary slips). Once finalised, the
-- figures are frozen and later edits never change them.
-- ---------------------------------------------------------------------
create table public.payroll_records (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references public.employees(id) on delete cascade,
  year              int not null,
  month             int not null check (month between 1 and 12),
  payable_days      numeric(6,2) not null,
  gross_earned      numeric(12,2) not null,
  total_penalties   numeric(12,2) not null default 0,
  total_deductions  numeric(12,2) not null default 0,
  total_additions   numeric(12,2) not null default 0,
  net_salary        numeric(12,2) not null,
  calc              jsonb not null,
  finalized_by      uuid default auth.uid(),
  finalized_at      timestamptz not null default now(),
  unique (employee_id, year, month)
);

-- ---------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id          bigserial primary key,
  table_name  text not null,
  record_id   text,
  action      text not null,
  old_data    jsonb,
  new_data    jsonb,
  reason      text,
  actor_id    uuid,
  created_at  timestamptz not null default now()
);
create index audit_logs_table_idx on public.audit_logs (table_name, created_at desc);

-- updated_at helper
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger employees_touch before update on public.employees
  for each row execute function public.touch_updated_at();
create trigger attendance_touch before update on public.attendance
  for each row execute function public.touch_updated_at();
create trigger org_settings_touch before update on public.org_settings
  for each row execute function public.touch_updated_at();
