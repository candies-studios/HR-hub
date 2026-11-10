-- =====================================================================
-- HR PORTAL - FUNCTIONS, BUSINESS RULES & TRIGGERS
-- =====================================================================

-- ---------------------------------------------------------------------
-- Identity helpers (SECURITY DEFINER so they can be used inside RLS)
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.my_employee_id()
returns uuid language sql stable security definer set search_path = public as $$
  select employee_id from public.profiles where id = auth.uid() and role = 'employee'
$$;

create or replace function public.require_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators can perform this action' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Employee code generator (CAN001, CAN002 ...). Service role only.
-- ---------------------------------------------------------------------
create or replace function public.generate_employee_code()
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  loop
    v_code := 'CAN' || lpad(nextval('public.employee_code_seq')::text, 3, '0');
    exit when not exists (select 1 from public.employees where employee_code = v_code);
  end loop;
  return v_code;
end $$;
revoke all on function public.generate_employee_code() from public, anon, authenticated;
grant execute on function public.generate_employee_code() to service_role;

-- ---------------------------------------------------------------------
-- Generic audit trigger. A reason can be attached for the current
-- transaction with: select set_config('hr.reason', '...', true)
-- ---------------------------------------------------------------------
create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
begin
  insert into public.audit_logs (table_name, record_id, action, old_data, new_data, reason, actor_id)
  values (tg_table_name,
          coalesce(v_new->>'id', v_old->>'id'),
          lower(tg_op), v_old, v_new,
          coalesce(nullif(current_setting('hr.reason', true), ''), v_new->>'reason'),
          auth.uid());
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['employees','salary_revisions','leave_types','leave_requests','holidays',
                           'penalties','salary_adjustments','payroll_records','org_settings']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I
                    for each row execute function public.audit_trigger()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Payroll lock helpers
-- ---------------------------------------------------------------------
create or replace function public.is_payroll_finalized(p_employee_id uuid, p_year int, p_month int)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.payroll_records
                 where employee_id = p_employee_id and year = p_year and month = p_month)
$$;

create or replace function public.assert_payroll_open(p_employee_id uuid, p_date date)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if public.is_payroll_finalized(p_employee_id, extract(year from p_date)::int, extract(month from p_date)::int) then
    raise exception 'Payroll for % is already finalised for this employee. Unlock it before making changes.',
      to_char(p_date, 'Mon YYYY');
  end if;
end $$;

create or replace function public.penalty_lock_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') and public.is_payroll_finalized(old.employee_id, old.deduction_year, old.deduction_month) then
    raise exception 'Payroll for %/% is finalised; this penalty can no longer be changed.', old.deduction_month, old.deduction_year;
  end if;
  if tg_op in ('INSERT','UPDATE') and public.is_payroll_finalized(new.employee_id, new.deduction_year, new.deduction_month) then
    raise exception 'Payroll for %/% is finalised; choose a later deduction month or unlock payroll.', new.deduction_month, new.deduction_year;
  end if;
  return coalesce(new, old);
end $$;
create trigger penalties_lock before insert or update or delete on public.penalties
  for each row execute function public.penalty_lock_trigger();

create or replace function public.adjustment_lock_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') and public.is_payroll_finalized(old.employee_id, old.year, old.month) then
    raise exception 'Payroll for %/% is finalised; this adjustment can no longer be changed.', old.month, old.year;
  end if;
  if tg_op in ('INSERT','UPDATE') and public.is_payroll_finalized(new.employee_id, new.year, new.month) then
    raise exception 'Payroll for %/% is finalised; unlock it before adding adjustments.', new.month, new.year;
  end if;
  return coalesce(new, old);
end $$;
create trigger salary_adjustments_lock before insert or update or delete on public.salary_adjustments
  for each row execute function public.adjustment_lock_trigger();

create or replace function public.salary_revision_lock_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  r := coalesce(new, old);
  if exists (select 1 from public.payroll_records p
             where p.employee_id = r.employee_id
               and make_date(p.year, p.month, 1) >= date_trunc('month', r.effective_date)::date) then
    raise exception 'A salary revision effective % would affect an already finalised payroll month. Use a later effective date.',
      to_char(r.effective_date, 'DD Mon YYYY');
  end if;
  if tg_op = 'UPDATE' and exists (select 1 from public.payroll_records p
             where p.employee_id = old.employee_id
               and make_date(p.year, p.month, 1) >= date_trunc('month', old.effective_date)::date) then
    raise exception 'This salary revision is used by a finalised payroll and cannot be changed.';
  end if;
  return r;
end $$;
create trigger salary_revisions_lock before insert or update or delete on public.salary_revisions
  for each row execute function public.salary_revision_lock_trigger();

-- ---------------------------------------------------------------------
-- Holiday applicability & leave-day counting
-- ---------------------------------------------------------------------
create or replace function public.is_holiday_for(p_employee_id uuid, p_date date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.holidays h
    where h.holiday_date = p_date
      and (h.applies_to_all or exists (select 1 from public.holiday_employees he
                                       where he.holiday_id = h.id and he.employee_id = p_employee_id)))
$$;

-- Working days in a range = calendar days minus weekly offs minus applicable holidays
create or replace function public.count_leave_days(p_employee_id uuid, p_start date, p_end date)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_offs int[];
  v_days numeric := 0;
  d date;
begin
  select weekly_off_days into v_offs from public.org_settings where id = 1;
  d := p_start;
  while d <= p_end loop
    if not (extract(dow from d)::int = any (v_offs)) and not public.is_holiday_for(p_employee_id, d) then
      v_days := v_days + 1;
    end if;
    d := d + 1;
  end loop;
  return v_days;
end $$;

-- ---------------------------------------------------------------------
-- Leave request validation trigger
-- ---------------------------------------------------------------------
create or replace function public.leave_request_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_type   public.leave_types;
  v_used   numeric;
  v_admin  boolean := public.is_admin();
begin
  select * into v_type from public.leave_types where id = new.leave_type_id;
  if not found or not v_type.is_active then
    raise exception 'Invalid or inactive leave type';
  end if;

  if not v_admin then
    new.status := 'pending';
    new.reviewed_by := null; new.reviewed_at := null; new.admin_comment := null;
    if new.employee_id is distinct from public.my_employee_id() then
      raise exception 'You can only apply leave for yourself' using errcode = '42501';
    end if;
    if new.start_date < public.ist_today() + v_type.min_notice_days then
      raise exception '% must be applied at least % day(s) in advance', v_type.name, v_type.min_notice_days;
    end if;
  end if;

  new.days := public.count_leave_days(new.employee_id, new.start_date, new.end_date);
  if new.days <= 0 then
    raise exception 'The selected dates contain no working days (only weekly offs / holidays)';
  end if;

  if exists (select 1 from public.leave_requests l
             where l.employee_id = new.employee_id and l.status in ('pending','approved')
               and l.start_date <= new.end_date and l.end_date >= new.start_date) then
    raise exception 'You already have a pending or approved leave overlapping these dates';
  end if;

  if v_type.annual_quota is not null then
    select coalesce(sum(days), 0) into v_used from public.leave_requests
     where employee_id = new.employee_id and leave_type_id = new.leave_type_id
       and status in ('pending','approved')
       and extract(year from start_date) = extract(year from new.start_date);
    if v_used + new.days > v_type.annual_quota then
      raise exception 'Insufficient % balance: % of % day(s) already used/requested this year',
        v_type.name, v_used, v_type.annual_quota;
    end if;
  end if;

  if new.status = 'approved' then
    declare m date := date_trunc('month', new.start_date)::date;
    begin
      while m <= new.end_date loop
        perform public.assert_payroll_open(new.employee_id, m);
        m := (m + interval '1 month')::date;
      end loop;
    end;
    new.reviewed_by := auth.uid(); new.reviewed_at := now();
  elsif new.status not in ('pending') then
    raise exception 'New leave requests must be pending or approved';
  end if;
  return new;
end $$;
create trigger leave_requests_validate before insert on public.leave_requests
  for each row execute function public.leave_request_before_insert();

-- Review (approve / reject) – admin only
create or replace function public.admin_review_leave(p_leave_id uuid, p_decision text, p_comment text default null)
returns public.leave_requests language plpgsql security definer set search_path = public as $$
declare v public.leave_requests; m date;
begin
  perform public.require_admin();
  if p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  select * into v from public.leave_requests where id = p_leave_id for update;
  if not found then raise exception 'Leave request not found'; end if;
  if v.status <> 'pending' then raise exception 'Only pending requests can be reviewed (current: %)', v.status; end if;
  if p_decision = 'approved' then
    m := date_trunc('month', v.start_date)::date;
    while m <= v.end_date loop
      perform public.assert_payroll_open(v.employee_id, m);
      m := (m + interval '1 month')::date;
    end loop;
  end if;
  perform set_config('hr.reason', coalesce(p_comment, ''), true);
  update public.leave_requests
     set status = p_decision, admin_comment = p_comment, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_leave_id returning * into v;
  return v;
end $$;

-- Cancel – employee (own pending, or approved leave that has not started) or admin
create or replace function public.cancel_leave(p_leave_id uuid, p_reason text default null)
returns public.leave_requests language plpgsql security definer set search_path = public as $$
declare v public.leave_requests; v_admin boolean := public.is_admin(); m date;
begin
  select * into v from public.leave_requests where id = p_leave_id for update;
  if not found then raise exception 'Leave request not found'; end if;
  if not v_admin then
    if v.employee_id is distinct from public.my_employee_id() then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    if not (v.status = 'pending' or (v.status = 'approved' and v.start_date > public.ist_today())) then
      raise exception 'Only pending requests or approved leaves that have not started can be cancelled';
    end if;
  else
    if v.status not in ('pending','approved') then raise exception 'This request cannot be cancelled'; end if;
    if v.status = 'approved' then
      m := date_trunc('month', v.start_date)::date;
      while m <= v.end_date loop
        perform public.assert_payroll_open(v.employee_id, m);
        m := (m + interval '1 month')::date;
      end loop;
    end if;
  end if;
  perform set_config('hr.reason', coalesce(p_reason, 'Cancelled'), true);
  update public.leave_requests set status = 'cancelled',
         admin_comment = coalesce(p_reason, admin_comment)
   where id = p_leave_id returning * into v;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- ATTENDANCE: employee sign-in / sign-out (server time, IST rules)
-- ---------------------------------------------------------------------
create or replace function public.late_info(p_date date, p_sign_in timestamptz,
                                            out is_late boolean, out late_minutes int)
language plpgsql stable security definer set search_path = public as $$
declare s public.org_settings; v_official timestamptz; v_cutoff timestamptz;
begin
  select * into s from public.org_settings where id = 1;
  v_official := (p_date + s.reporting_time) at time zone 'Asia/Kolkata';
  v_cutoff   := v_official + make_interval(mins => s.grace_minutes);
  if p_sign_in is null then
    is_late := false; late_minutes := 0;
  else
    is_late := p_sign_in > v_cutoff;               -- "at or before 10:00" is on time
    late_minutes := case when is_late then ceil(extract(epoch from (p_sign_in - v_official)) / 60)::int else 0 end;
  end if;
end $$;

create or replace function public.employee_sign_in(p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_emp     uuid := public.my_employee_id();
  v_today   date := public.ist_today();
  v_now     timestamptz := now();
  v_att     public.attendance;
  v_late    record;
  v_half    boolean;
  v_session uuid;
  v_new     boolean := false;
begin
  if v_emp is null then raise exception 'Only employees record attendance' using errcode = '42501'; end if;
  if not exists (select 1 from public.employees where id = v_emp and status = 'active') then
    raise exception 'Your employee account is inactive';
  end if;

  select * into v_att from public.attendance where employee_id = v_emp and work_date = v_today for update;
  if not found then
    select * into v_late from public.late_info(v_today, v_now);
    select late_marks_half_day into v_half from public.org_settings where id = 1;
    insert into public.attendance (employee_id, work_date, status, sign_in_at, is_late, late_minutes, source)
    values (v_emp, v_today,
            case when v_late.is_late and v_half then 'half_day' else 'present' end,
            v_now, v_late.is_late, v_late.late_minutes, 'portal')
    on conflict (employee_id, work_date) do nothing
    returning * into v_att;
    if v_att.id is null then
      select * into v_att from public.attendance where employee_id = v_emp and work_date = v_today;
    else
      v_new := true;
    end if;
  elsif v_att.sign_in_at is null then
    -- record pre-created by admin: keep admin status, just stamp the first login
    update public.attendance set sign_in_at = v_now where id = v_att.id returning * into v_att;
  end if;

  insert into public.attendance_sessions (attendance_id, employee_id, login_at, user_agent)
  values (v_att.id, v_emp, v_now, left(p_user_agent, 300))
  returning id into v_session;

  return jsonb_build_object('attendance', to_jsonb(v_att), 'session_id', v_session, 'first_login_today', v_new);
end $$;

create or replace function public.employee_sign_out(p_session_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_emp  uuid := public.my_employee_id();
  v_sess public.attendance_sessions;
  v_att  public.attendance;
begin
  if v_emp is null then return null; end if;

  if p_session_id is not null then
    select * into v_sess from public.attendance_sessions
     where id = p_session_id and employee_id = v_emp and logout_at is null for update;
  end if;
  if v_sess.id is null then
    select * into v_sess from public.attendance_sessions
     where employee_id = v_emp and logout_at is null order by login_at desc limit 1 for update;
  end if;
  if v_sess.id is null then return null; end if;

  update public.attendance_sessions set logout_at = now(), closed_by = 'employee' where id = v_sess.id;

  -- the logout belongs to the attendance day of the login session
  update public.attendance a
     set sign_out_at   = now(),
         total_minutes = case when a.sign_in_at is null then 0
                              else greatest(0, floor(extract(epoch from (now() - a.sign_in_at)) / 60))::int end
   where a.id = v_sess.attendance_id
  returning * into v_att;

  return jsonb_build_object('attendance', to_jsonb(v_att), 'session_id', v_sess.id);
end $$;

-- ---------------------------------------------------------------------
-- ATTENDANCE: admin create / edit (mandatory reason, full history)
-- ---------------------------------------------------------------------
create or replace function public.admin_save_attendance(
  p_employee_id    uuid,
  p_work_date      date,
  p_status         text,
  p_sign_in_at     timestamptz,
  p_sign_out_at    timestamptz,
  p_late_exception boolean,
  p_remarks        text,
  p_reason         text
) returns public.attendance language plpgsql security definer set search_path = public as $$
declare
  v_old  public.attendance;
  v_new  public.attendance;
  v_emp  public.employees;
  v_late record;
  v_status text := p_status;
  v_exc  boolean := coalesce(p_late_exception, false);
begin
  perform public.require_admin();
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A reason (min. 3 characters) is mandatory for attendance changes';
  end if;
  if v_status not in ('present','half_day','absent') then raise exception 'Invalid status'; end if;
  select * into v_emp from public.employees where id = p_employee_id;
  if not found then raise exception 'Employee not found'; end if;
  if p_work_date < v_emp.date_of_joining then raise exception 'Date is before the employee''s joining date'; end if;
  if p_work_date > public.ist_today() then raise exception 'Attendance cannot be marked for a future date'; end if;
  if p_sign_out_at is not null and p_sign_in_at is not null and p_sign_out_at < p_sign_in_at then
    raise exception 'Sign-out time cannot be before sign-in time';
  end if;
  perform public.assert_payroll_open(p_employee_id, p_work_date);

  select * into v_late from public.late_info(p_work_date, p_sign_in_at);
  if v_status = 'absent' then v_exc := false; end if;
  if v_exc and v_late.is_late and v_status = 'half_day' then v_status := 'present'; end if;
  if not v_late.is_late then v_exc := false; end if;

  select * into v_old from public.attendance where employee_id = p_employee_id and work_date = p_work_date for update;

  insert into public.attendance as a (employee_id, work_date, status, sign_in_at, sign_out_at, total_minutes,
                                      is_late, late_minutes, late_exception, late_exception_reason,
                                      late_exception_by, late_exception_at, source, remarks)
  values (p_employee_id, p_work_date, v_status, p_sign_in_at, p_sign_out_at,
          case when p_sign_in_at is not null and p_sign_out_at is not null
               then floor(extract(epoch from (p_sign_out_at - p_sign_in_at)) / 60)::int else 0 end,
          v_late.is_late, v_late.late_minutes, v_exc,
          case when v_exc then p_reason end,
          case when v_exc then auth.uid() end,
          case when v_exc then now() end,
          'admin', p_remarks)
  on conflict (employee_id, work_date) do update
     set status = excluded.status, sign_in_at = excluded.sign_in_at, sign_out_at = excluded.sign_out_at,
         total_minutes = excluded.total_minutes, is_late = excluded.is_late, late_minutes = excluded.late_minutes,
         late_exception = excluded.late_exception,
         late_exception_reason = case when excluded.late_exception and not a.late_exception then excluded.late_exception_reason
                                      when excluded.late_exception then a.late_exception_reason end,
         late_exception_by = case when excluded.late_exception and not a.late_exception then excluded.late_exception_by
                                  when excluded.late_exception then a.late_exception_by end,
         late_exception_at = case when excluded.late_exception and not a.late_exception then excluded.late_exception_at
                                  when excluded.late_exception then a.late_exception_at end,
         remarks = excluded.remarks
  returning * into v_new;

  -- close sessions left open when admin fixes a forgotten logout
  if p_sign_out_at is not null then
    update public.attendance_sessions set logout_at = p_sign_out_at, closed_by = 'admin'
     where attendance_id = v_new.id and logout_at is null;
  end if;

  insert into public.attendance_history (attendance_id, employee_id, work_date, action, old_data, new_data, reason)
  values (v_new.id, p_employee_id, p_work_date, case when v_old.id is null then 'create' else 'update' end,
          to_jsonb(v_old), to_jsonb(v_new), p_reason);
  return v_new;
end $$;

create or replace function public.admin_set_late_exception(p_attendance_id uuid, p_approve boolean, p_reason text default null)
returns public.attendance language plpgsql security definer set search_path = public as $$
declare v_old public.attendance; v_new public.attendance;
begin
  perform public.require_admin();
  select * into v_old from public.attendance where id = p_attendance_id for update;
  if not found then raise exception 'Attendance record not found'; end if;
  if not v_old.is_late then raise exception 'This attendance is not a late arrival'; end if;
  perform public.assert_payroll_open(v_old.employee_id, v_old.work_date);

  if p_approve then
    update public.attendance
       set late_exception = true, status = 'present',
           late_exception_reason = nullif(trim(coalesce(p_reason, '')), ''),
           late_exception_by = auth.uid(), late_exception_at = now()
     where id = p_attendance_id returning * into v_new;
  else
    update public.attendance
       set late_exception = false,
           status = case when (select late_marks_half_day from public.org_settings where id = 1) then 'half_day' else status end,
           late_exception_reason = null, late_exception_by = null, late_exception_at = null
     where id = p_attendance_id returning * into v_new;
  end if;

  insert into public.attendance_history (attendance_id, employee_id, work_date, action, old_data, new_data, reason)
  values (v_new.id, v_new.employee_id, v_new.work_date,
          case when p_approve then 'late_exception_approved' else 'late_exception_revoked' end,
          to_jsonb(v_old), to_jsonb(v_new), coalesce(nullif(trim(coalesce(p_reason, '')), ''), '(no reason given)'));
  return v_new;
end $$;

create or replace function public.admin_delete_attendance(p_attendance_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_old public.attendance;
begin
  perform public.require_admin();
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'A reason is mandatory'; end if;
  select * into v_old from public.attendance where id = p_attendance_id for update;
  if not found then raise exception 'Attendance record not found'; end if;
  perform public.assert_payroll_open(v_old.employee_id, v_old.work_date);
  insert into public.attendance_history (attendance_id, employee_id, work_date, action, old_data, new_data, reason)
  values (v_old.id, v_old.employee_id, v_old.work_date, 'delete', to_jsonb(v_old), null, p_reason);
  delete from public.attendance where id = p_attendance_id;
end $$;

-- ---------------------------------------------------------------------
-- Payroll unlock (admin, mandatory reason)
-- ---------------------------------------------------------------------
create or replace function public.unlock_payroll(p_payroll_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'A reason is mandatory to unlock payroll'; end if;
  perform set_config('hr.reason', p_reason, true);
  delete from public.payroll_records where id = p_payroll_id;
  if not found then raise exception 'Payroll record not found'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Copy holidays from one year to another (dates shifted by year; admin
-- must review lunar festivals afterwards).
-- ---------------------------------------------------------------------
create or replace function public.copy_holidays(p_from_year int, p_to_year int)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public.require_admin();
  insert into public.holidays (name, holiday_date, category, is_paid, applies_to_all, description)
  select name,
         make_date(p_to_year, extract(month from holiday_date)::int,
                   least(extract(day from holiday_date)::int,
                         extract(day from (make_date(p_to_year, extract(month from holiday_date)::int, 1)
                                           + interval '1 month - 1 day'))::int)),
         category, is_paid, applies_to_all,
         coalesce(description, '') || case when category in ('festival','optional') then ' (copied – verify date)' else '' end
    from public.holidays where extract(year from holiday_date) = p_from_year
  on conflict (holiday_date, name) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Password change tracking: when an auth user's password changes,
-- clear the "must change password" flag.
-- ---------------------------------------------------------------------
create or replace function public.handle_password_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    update public.profiles set must_change_password = false where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_password_change on auth.users;
create trigger on_auth_password_change
  after update of encrypted_password on auth.users
  for each row execute function public.handle_password_change();

-- ---------------------------------------------------------------------
-- Bootstrap: promote an existing auth user to admin.
-- Run from the SQL editor:  select public.make_admin('you@company.com');
-- ---------------------------------------------------------------------
create or replace function public.make_admin(p_email text, p_display_name text default 'Administrator')
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then raise exception 'No auth user with e-mail %. Create it first under Authentication > Users.', p_email; end if;
  insert into public.profiles (id, role, display_name) values (v_id, 'admin', p_display_name)
  on conflict (id) do update set role = 'admin', employee_id = null, display_name = excluded.display_name;
  return 'OK: ' || p_email || ' is now an admin';
end $$;
revoke all on function public.make_admin(text, text) from public, anon, authenticated;

-- Internal helpers should not be callable directly by clients
revoke all on function public.audit_trigger() from public, anon, authenticated;
revoke all on function public.handle_password_change() from public, anon, authenticated;
revoke all on function public.penalty_lock_trigger() from public, anon, authenticated;
revoke all on function public.adjustment_lock_trigger() from public, anon, authenticated;
revoke all on function public.salary_revision_lock_trigger() from public, anon, authenticated;
revoke all on function public.leave_request_before_insert() from public, anon, authenticated;
revoke execute on all functions in schema public from anon;
