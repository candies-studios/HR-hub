import { MonthAttendance } from '../../components/MonthAttendance';
import { PageHeader } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { formatClock, officeHours } from '../../lib/dates';

export default function MyAttendance() {
  const { employee, settings } = useAuth();
  if (!employee) return null;
  return (
    <>
      <PageHeader
        title="My Attendance"
        subtitle={`Office hours ${officeHours(settings)}. Sign in at or before ${formatClock(settings?.reporting_time ?? '09:30')} for a full day; later sign-ins are marked half day unless HR approves an exception. If you forget to log out, ${formatClock(settings?.office_end_time ?? '18:30')} is recorded. Contact HR if a record needs correction.`}
      />
      <MonthAttendance employee={employee} />
    </>
  );
}
