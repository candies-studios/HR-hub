import { Avatar, Card, PageHeader } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate } from '../../lib/dates';
import { useSignedUrl } from '../../lib/hooks';
import { ChangePasswordForm } from '../ChangePassword';

export default function MyProfile() {
  const { employee } = useAuth();
  const photo = useSignedUrl('avatars', employee?.photo_path);
  if (!employee) return null;
  const rows: [string, string | null][] = [
    ['Employee ID', employee.employee_code], ['Full name', employee.full_name], ['Date of birth', formatDate(employee.date_of_birth)],
    ['E-mail', employee.email], ['Primary contact', employee.phone],
    ['Alternate contact', employee.alt_phone ? `${employee.alt_phone}${employee.alt_contact_relation ? ` (${employee.alt_contact_relation})` : ''}` : null],
    ['Blood group', employee.blood_group], ['Date of joining', formatDate(employee.date_of_joining)], ['Designation', employee.designation],
  ];
  return (
    <>
      <PageHeader title="My Profile" subtitle="To update your details, please contact HR." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-col gap-6 sm:flex-row">
            <Avatar name={employee.full_name} url={photo} size={88} />
            <dl className="grid flex-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              {rows.map(([k, v]) => <div key={k}><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt><dd className="mt-0.5 text-sm text-slate-900">{v || '—'}</dd></div>)}
            </dl>
          </div>
        </Card>
        <Card title="Change password"><ChangePasswordForm /></Card>
      </div>
    </>
  );
}
