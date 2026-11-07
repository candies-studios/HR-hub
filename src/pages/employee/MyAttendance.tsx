import { MonthAttendance } from '../../components/MonthAttendance';
import { PageHeader } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';

export default function MyAttendance() {
  const { employee, settings } = useAuth();
  if (!employee) return null;
  return (
    <>
      <PageHeader
        title="My Attendance"
        subtitle={`Sign in at or before ${settings?.reporting_time.slice(0, 5) ?? '10:00'} AM IST for a full day. Later sign-ins are marked half day unless HR approves an exception. Contact HR if a record needs correction.`}
      />
      <MonthAttendance employee={employee} />
    </>
  );
}
