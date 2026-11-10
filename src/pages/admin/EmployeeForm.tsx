import { ArrowLeft, Save, Upload } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Avatar, Button, Card, Field, Input, Loading, PageHeader, Select } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { currentYearMonth, dobToPassword, todayIST } from '../../lib/dates';
import { money } from '../../lib/format';
import { useSignedUrl } from '../../lib/hooks';
import { dailySalary } from '../../lib/salary';
import { adminEmployees, errMsg, must, supabase } from '../../lib/supabase';
import { BLOOD_GROUPS, type Employee } from '../../lib/types';

const RELATIONS = ['Father', 'Mother', 'Spouse', 'Brother', 'Sister', 'Son', 'Daughter', 'Friend', 'Guardian', 'Other'];

interface FormState {
  full_name: string; date_of_birth: string; email: string; phone: string; alt_phone: string; alt_contact_relation: string;
  blood_group: string; date_of_joining: string; designation: string; monthly_salary: string; salary_effective_date: string;
}
const empty: FormState = {
  full_name: '', date_of_birth: '', email: '', phone: '', alt_phone: '', alt_contact_relation: '', blood_group: '',
  date_of_joining: todayIST(), designation: '', monthly_salary: '', salary_effective_date: '',
};

const phoneOk = (p: string) => /^(\+91[\s-]?)?[6-9]\d{9}$/.test(p.replace(/\s/g, ''));

export default function EmployeeForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const [f, setF] = useState<FormState>(empty);
  const [existing, setExisting] = useState<Employee | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [loading, setLoading] = useState(isEdit);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const existingPhoto = useSignedUrl('avatars', existing?.photo_path);

  useEffect(() => {
    if (!id) return;
    must(supabase.from('employees').select('*').eq('id', id).single()).then((e) => {
      const emp = e as unknown as Employee;
      setExisting(emp);
      setF({
        ...empty,
        full_name: emp.full_name, date_of_birth: emp.date_of_birth, email: emp.email ?? '', phone: emp.phone,
        alt_phone: emp.alt_phone ?? '', alt_contact_relation: emp.alt_contact_relation ?? '', blood_group: emp.blood_group ?? '',
        date_of_joining: emp.date_of_joining, designation: emp.designation,
      });
    }).catch((e) => setServerError(e.message)).finally(() => setLoading(false));
  }, [id]);

  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const validate = () => {
    const er: typeof errors = {};
    if (f.full_name.trim().length < 2) er.full_name = 'Enter the full name';
    if (!f.date_of_birth) er.date_of_birth = 'Required';
    else if (f.date_of_birth > todayIST()) er.date_of_birth = 'Cannot be in the future';
    if (!f.date_of_joining) er.date_of_joining = 'Required';
    else if (f.date_of_birth && f.date_of_joining <= f.date_of_birth) er.date_of_joining = 'Must be after date of birth';
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) er.email = 'Invalid e-mail';
    if (!phoneOk(f.phone)) er.phone = 'Enter a valid 10-digit mobile number';
    if (f.alt_phone && !phoneOk(f.alt_phone)) er.alt_phone = 'Enter a valid 10-digit mobile number';
    if (f.alt_phone && !f.alt_contact_relation) er.alt_contact_relation = 'Select the relationship';
    if (!f.designation.trim()) er.designation = 'Required';
    if (!isEdit) {
      const s = Number(f.monthly_salary);
      if (!f.monthly_salary || !Number.isFinite(s) || s <= 0) er.monthly_salary = 'Enter a salary greater than 0';
    }
    setErrors(er);
    return Object.keys(er).length === 0;
  };

  const uploadPhoto = async (empId: string) => {
    if (!photo) return;
    const ext = photo.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${empId}/photo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(path, photo, { upsert: true, contentType: photo.type });
    if (error) throw error;
    await must(supabase.from('employees').update({ photo_path: path }).eq('id', empId));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setServerError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      if (isEdit && existing) {
        await must(supabase.from('employees').update({
          full_name: f.full_name.trim(), date_of_birth: f.date_of_birth, email: f.email.trim() || null, phone: f.phone.trim(),
          alt_phone: f.alt_phone.trim() || null, alt_contact_relation: f.alt_contact_relation || null,
          blood_group: f.blood_group || null, date_of_joining: f.date_of_joining, designation: f.designation.trim(),
        }).eq('id', existing.id));
        await uploadPhoto(existing.id);
        toast('Employee updated');
        navigate(`/admin/employees/${existing.id}`);
      } else {
        const res = await adminEmployees<{ employee: Employee; employee_code: string }>({
          action: 'create',
          employee: { ...f, monthly_salary: Number(f.monthly_salary), salary_effective_date: f.salary_effective_date || f.date_of_joining },
        });
        try { await uploadPhoto(res.employee.id); } catch (err) { toast('Employee created, but photo upload failed: ' + errMsg(err), 'error'); }
        toast(`Employee ${res.employee_code} created. Initial password: ${dobToPassword(f.date_of_birth)}`);
        navigate(`/admin/employees/${res.employee.id}`);
      }
    } catch (err) {
      setServerError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading />;
  const { year, month } = currentYearMonth();
  const sal = Number(f.monthly_salary) || 0;

  return (
    <>
      <Link to={isEdit ? `/admin/employees/${id}` : '/admin/employees'} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <PageHeader title={isEdit ? `Edit ${existing?.employee_code ?? ''}` : 'Add Employee'} subtitle={isEdit ? 'Salary changes are made from the employee profile (Revise salary) so history is preserved.' : 'An Employee ID (CAN001, CAN002 …) and login are created automatically.'} />
      <form onSubmit={submit} className="space-y-6">
        <Card title="Personal information">
          <div className="mb-5 flex items-center gap-4">
            <Avatar name={f.full_name || '?'} url={preview ?? existingPhoto} size={64} />
            <label className="cursor-pointer">
              <span className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <Upload className="h-4 w-4" /> {existing?.photo_path || photo ? 'Change photo' : 'Upload photo (optional)'}
              </span>
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) { toast('Photo must be under 2 MB', 'error'); return; }
                setPhoto(file); setPreview(URL.createObjectURL(file));
              }} />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {isEdit && <Field label="Employee ID"><Input value={existing?.employee_code ?? ''} disabled /></Field>}
            <Field label="Full name" required error={errors.full_name}><Input value={f.full_name} onChange={set('full_name')} /></Field>
            <Field label="Date of birth" required error={errors.date_of_birth} hint={!isEdit && f.date_of_birth ? `Initial password will be ${dobToPassword(f.date_of_birth)}` : undefined}>
              <Input type="date" value={f.date_of_birth} onChange={set('date_of_birth')} max={todayIST()} />
            </Field>
            <Field label="E-mail address" error={errors.email}><Input type="email" value={f.email} onChange={set('email')} /></Field>
            <Field label="Primary contact number" required error={errors.phone}><Input value={f.phone} onChange={set('phone')} placeholder="98XXXXXXXX" inputMode="tel" /></Field>
            <Field label="Alternate contact number" error={errors.alt_phone}><Input value={f.alt_phone} onChange={set('alt_phone')} inputMode="tel" /></Field>
            <Field label="Relationship with alternate contact" error={errors.alt_contact_relation}>
              <Select value={f.alt_contact_relation} onChange={set('alt_contact_relation')}>
                <option value="">—</option>{RELATIONS.map((r) => <option key={r}>{r}</option>)}
              </Select>
            </Field>
            <Field label="Blood group">
              <Select value={f.blood_group} onChange={set('blood_group')}>
                <option value="">—</option>{BLOOD_GROUPS.map((b) => <option key={b}>{b}</option>)}
              </Select>
            </Field>
          </div>
        </Card>

        <Card title="Employment information">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Date of joining" required error={errors.date_of_joining}><Input type="date" value={f.date_of_joining} onChange={set('date_of_joining')} /></Field>
            <Field label="Designation" required error={errors.designation}><Input value={f.designation} onChange={set('designation')} /></Field>
            {!isEdit && (
              <>
                <Field label="Monthly salary (₹)" required error={errors.monthly_salary}
                  hint={sal > 0 ? `Daily salary this month: ${money(dailySalary(sal, year, month))} (varies with days in month)` : undefined}>
                  <Input type="number" min="1" step="0.01" value={f.monthly_salary} onChange={set('monthly_salary')} />
                </Field>
                <Field label="Salary effective date" hint="Defaults to the date of joining">
                  <Input type="date" value={f.salary_effective_date} onChange={set('salary_effective_date')} />
                </Field>
              </>
            )}
          </div>
        </Card>

        {serverError && <Alert tone="error">{serverError}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" loading={busy} icon={<Save className="h-4 w-4" />}>{isEdit ? 'Save changes' : 'Create employee'}</Button>
        </div>
      </form>
    </>
  );
}
