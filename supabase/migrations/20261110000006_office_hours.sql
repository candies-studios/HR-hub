-- =====================================================================
-- Office hours 9:30 AM – 6:30 PM IST and automatic logout.
-- * reporting_time  : sign-in at or before = full day (now 09:30)
-- * office_end_time : official logout time (18:30). Logging out earlier
--                     has no effect on pay; it is shown for information.
-- * If an employee forgets to log out, the open session is closed
--   automatically at the office end time of that day.
-- Safe to run more than once.
-- =====================================================================

alter table public.org_settings add column if not exists office_end_time time not null default '18:30';
alter table public.org_settings alter column reporting_time set default '09:30';
update public.org_settings set reporting_time = '09:30', office_end_time = '18:30' where id = 1;

alter table public.attendance add column if not exists auto_signed_out boolean not null default false;

alter table public.attendance_sessions drop constraint if exists attendance_sessions_closed_by_check;
alter table public.attendance_sessions
  add constraint attendance_sessions_closed_by_check check (closed_by in ('employee','admin','system'));

-- Office timings are not sensitive: let the login page show them.
drop policy if exists "settings: read for signed-in users" on public.org_settings;
drop policy if exists "settings: read" on public.org_settings;
create policy "settings: read" on public.org_settings for select to anon, authenticated using (true);
grant select on public.org_settings to anon;

-- ---------------------------------------------------------------------
-- Close login sessions left open from earlier days at the office end time.
-- Called automatically by the app (any signed-in user) and on sign-in.
-- ---------------------------------------------------------------------
create or replace function public.close_stale_sessions()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_end  time;
  v_n    int := 0;
  r      record;
  v_out  timestamptz;
  v_att  public.attendance;
  v_new  public.attendance;
begin
  select office_end_time into v_end from public.org_settings where id = 1;

  for r in
    select s.id, s.login_at, s.attendance_id, a.work_date
      from public.attendance_sessions s
      join public.attendance a on a.id = s.attendance_id
     where s.logout_at is null and a.work_date < public.ist_today()
     for update of s
  loop
    v_out := greatest((r.work_date + v_end) at time zone 'Asia/Kolkata', r.login_at);
    update public.attendance_sessions set logout_at = v_out, closed_by = 'system' where id = r.id;

    select * into v_att from public.attendance where id = r.attendance_id for update;
    if v_att.sign_out_at is null or v_att.sign_out_at < v_out then
      update public.attendance
         set sign_out_at = v_out,
             auto_signed_out = true,
             total_minutes = case when sign_in_at is null then 0
                                  else greatest(0, floor(extract(epoch from (v_out - sign_in_at)) / 60))::int end
       where id = v_att.id
      returning * into v_new;
      insert into public.attendance_history (attendance_id, employee_id, work_date, action, old_data, new_data, reason, changed_by)
      values (v_att.id, v_att.employee_id, v_att.work_date, 'auto_logout', to_jsonb(v_att), to_jsonb(v_new),
              'Forgot to log out – sign-out recorded automatically at office end time', null);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.close_stale_sessions() from public, anon;
grant execute on function public.close_stale_sessions() to authenticated, service_role;

-- A real sign-out (employee or admin) clears the "auto" marker
create or replace function public.attendance_clear_auto_flag()
returns trigger language plpgsql as $$
begin
  if new.sign_out_at is distinct from old.sign_out_at and new.auto_signed_out = old.auto_signed_out then
    new.auto_signed_out := false;
  end if;
  return new;
end $$;
drop trigger if exists attendance_auto_flag on public.attendance;
create trigger attendance_auto_flag before update on public.attendance
  for each row execute function public.attendance_clear_auto_flag();

-- Employee sign-in first closes any forgotten sessions from earlier days
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

  perform public.close_stale_sessions();

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
    update public.attendance set sign_in_at = v_now where id = v_att.id returning * into v_att;
  end if;

  insert into public.attendance_sessions (attendance_id, employee_id, login_at, user_agent)
  values (v_att.id, v_emp, v_now, left(p_user_agent, 300))
  returning id into v_session;

  return jsonb_build_object('attendance', to_jsonb(v_att), 'session_id', v_session, 'first_login_today', v_new);
end $$;

-- Optional: if the pg_cron extension is enabled, also close forgotten sessions every night at 23:55 IST.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'hr-close-stale-sessions';
    perform cron.schedule('hr-close-stale-sessions', '25 18 * * *',
      'select public.close_stale_sessions()');
  end if;
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end $$;
