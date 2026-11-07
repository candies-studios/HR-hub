// Supabase Edge Function: admin-employees
// Privileged employee operations that need the service-role key:
//   - create          : create employee + auth login (password = DOB as DDMMYYYY) + initial salary
//   - reset_password  : reset an employee's password back to DOB and force change on next login
//   - set_status      : activate / deactivate an employee (deactivation blocks login)
//
// Deploy:  supabase functions deploy admin-employees
// Secrets: supabase secrets set EMPLOYEE_EMAIL_DOMAIN=staff.yourcompany.com
// (SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EMAIL_DOMAIN = (Deno.env.get('EMPLOYEE_EMAIL_DOMAIN') ?? '').trim().toLowerCase();

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const opt = (v: unknown) => (str(v) === '' ? null : str(v));

/** DOB yyyy-mm-dd -> DDMMYYYY (initial password) */
const dobPassword = (dob: string) => {
  const [y, m, d] = dob.split('-');
  return `${d}${m}${y}`;
};
const loginEmail = (code: string) => `${code.toLowerCase()}@${EMAIL_DOMAIN}`;

async function audit(admin: SupabaseClient, actor: string, action: string, recordId: string | null, data: unknown, reason?: string) {
  await admin.from('audit_logs').insert({
    table_name: 'employees_admin', record_id: recordId, action, new_data: data, reason: reason ?? null, actor_id: actor,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    if (!EMAIL_DOMAIN) return json({ error: 'EMPLOYEE_EMAIL_DOMAIN secret is not configured' }, 500);

    // ---- authenticate caller and require admin role ----
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile } = await admin.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
    if (profile?.role !== 'admin') return json({ error: 'Only administrators can manage employees' }, 403);
    const actor = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;

    // =================================================================
    if (action === 'create') {
      const e = body.employee ?? {};
      const fullName = str(e.full_name);
      const errors: string[] = [];
      if (fullName.length < 2) errors.push('Full name is required');
      if (!isDate(e.date_of_birth)) errors.push('Valid date of birth is required');
      if (!isDate(e.date_of_joining)) errors.push('Valid date of joining is required');
      if (!str(e.phone)) errors.push('Primary contact number is required');
      if (!str(e.designation)) errors.push('Designation is required');
      if (e.blood_group && !BLOOD_GROUPS.includes(e.blood_group)) errors.push('Invalid blood group');
      const salary = Number(e.monthly_salary);
      if (!Number.isFinite(salary) || salary <= 0) errors.push('Monthly salary must be greater than 0');
      const effective = isDate(e.salary_effective_date) ? e.salary_effective_date : e.date_of_joining;
      if (errors.length) return json({ error: errors.join('. ') }, 400);

      const { data: code, error: codeErr } = await admin.rpc('generate_employee_code');
      if (codeErr || !code) return json({ error: 'Could not generate employee ID: ' + codeErr?.message }, 500);

      // 1. auth user
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: loginEmail(code),
        password: dobPassword(e.date_of_birth),
        email_confirm: true,
        user_metadata: { employee_code: code, full_name: fullName },
        app_metadata: { role: 'employee' },
      });
      if (createErr || !created.user) return json({ error: 'Could not create login: ' + createErr?.message }, 500);
      const authId = created.user.id;

      // 2. employee row
      const { data: emp, error: empErr } = await admin.from('employees').insert({
        employee_code: code,
        full_name: fullName,
        date_of_birth: e.date_of_birth,
        email: opt(e.email),
        phone: str(e.phone),
        alt_phone: opt(e.alt_phone),
        alt_contact_relation: opt(e.alt_contact_relation),
        blood_group: opt(e.blood_group),
        date_of_joining: e.date_of_joining,
        designation: str(e.designation),
        auth_user_id: authId,
      }).select().single();
      if (empErr || !emp) {
        await admin.auth.admin.deleteUser(authId);
        return json({ error: 'Could not save employee: ' + empErr?.message }, 400);
      }

      // 3. profile + 4. salary
      const { error: profErr } = await admin.from('profiles').insert({
        id: authId, role: 'employee', employee_id: emp.id, display_name: fullName, must_change_password: true,
      });
      const { error: salErr } = profErr ? { error: null } : await admin.from('salary_revisions').insert({
        employee_id: emp.id, monthly_salary: Math.round(salary * 100) / 100, effective_date: effective,
        reason: 'Initial salary', created_by: actor,
      });
      if (profErr || salErr) {
        await admin.from('employees').delete().eq('id', emp.id);
        await admin.auth.admin.deleteUser(authId);
        return json({ error: 'Could not finish setup: ' + (profErr ?? salErr)?.message }, 400);
      }

      await audit(admin, actor, 'create_employee', emp.id, { employee_code: code, full_name: fullName });
      return json({ employee: emp, employee_code: code });
    }

    // =================================================================
    if (action === 'reset_password' || action === 'set_status') {
      const employeeId = str(body.employee_id);
      const { data: emp } = await admin.from('employees').select('*').eq('id', employeeId).maybeSingle();
      if (!emp) return json({ error: 'Employee not found' }, 404);
      if (!emp.auth_user_id) return json({ error: 'This employee has no login account' }, 400);

      if (action === 'reset_password') {
        const { error } = await admin.auth.admin.updateUserById(emp.auth_user_id, { password: dobPassword(emp.date_of_birth) });
        if (error) return json({ error: error.message }, 500);
        // the password-change trigger clears the flag; set it again afterwards
        await admin.from('profiles').update({ must_change_password: true }).eq('id', emp.auth_user_id);
        await audit(admin, actor, 'reset_password', emp.id, { employee_code: emp.employee_code }, opt(body.reason) ?? undefined);
        return json({ ok: true });
      }

      const status = body.status === 'inactive' ? 'inactive' : 'active';
      const reason = str(body.reason);
      if (reason.length < 3) return json({ error: 'A reason is required' }, 400);
      const inactiveFrom = status === 'inactive' ? (isDate(body.inactive_from) ? body.inactive_from : null) : null;
      if (status === 'inactive' && !inactiveFrom) return json({ error: 'Last working date is required' }, 400);

      const { error: banErr } = await admin.auth.admin.updateUserById(emp.auth_user_id, {
        ban_duration: status === 'inactive' ? '876000h' : 'none',
      });
      if (banErr) return json({ error: banErr.message }, 500);
      const { data: updated, error: upErr } = await admin.from('employees')
        .update({ status, inactive_from: inactiveFrom }).eq('id', emp.id).select().single();
      if (upErr) return json({ error: upErr.message }, 500);
      await audit(admin, actor, status === 'inactive' ? 'deactivate_employee' : 'activate_employee', emp.id,
        { status, inactive_from: inactiveFrom }, reason);
      return json({ employee: updated });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unexpected error' }, 500);
  }
});
