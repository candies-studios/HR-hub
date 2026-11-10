-- =====================================================================
-- Candies Studios: employee IDs CAN001, CAN002 ... and company name.
-- Safe to run on a database that already has EMPxxx employees: they are
-- renamed to CANxxx (same number) and their login is updated to match.
-- =====================================================================

alter table public.employees drop constraint if exists employees_employee_code_check;

-- 1. rename the hidden login e-mail of existing employees (emp001@domain -> can001@domain)
update auth.users u
   set email = lower(regexp_replace(e.employee_code, '^EMP', 'CAN')) || '@' || split_part(u.email, '@', 2),
       raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
                            || jsonb_build_object('employee_code', regexp_replace(e.employee_code, '^EMP', 'CAN'))
  from public.employees e
 where e.auth_user_id = u.id and e.employee_code like 'EMP%';

update auth.identities i
   set identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(u.email))
  from auth.users u
  join public.employees e on e.auth_user_id = u.id
 where i.user_id = u.id and i.provider = 'email' and e.employee_code like 'EMP%';

-- 2. rename the employee IDs
update public.employees
   set employee_code = regexp_replace(employee_code, '^EMP', 'CAN')
 where employee_code like 'EMP%';

alter table public.employees
  add constraint employees_employee_code_check check (employee_code ~ '^CAN[0-9]{3,}$');

-- 3. new IDs use the CAN prefix
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

-- 4. company name
alter table public.org_settings alter column company_name set default 'Candies Studios';
update public.org_settings set company_name = 'Candies Studios' where company_name = 'Your Company Pvt. Ltd.';
