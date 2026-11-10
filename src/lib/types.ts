export type Role = 'admin' | 'employee';

export interface Profile {
  id: string;
  role: Role;
  employee_id: string | null;
  display_name: string | null;
  must_change_password: boolean;
}

export interface OrgSettings {
  id: number;
  company_name: string;
  company_address: string;
  reporting_time: string; // HH:MM:SS – sign-in at or before = full day
  office_end_time: string; // HH:MM:SS – official logout time
  grace_minutes: number;
  late_marks_half_day: boolean;
  weekly_off_days: number[];
  weekly_off_paid: boolean;
  updated_at: string;
}

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
export const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export interface Employee {
  id: string;
  employee_code: string;
  full_name: string;
  date_of_birth: string;
  email: string | null;
  phone: string;
  alt_phone: string | null;
  alt_contact_relation: string | null;
  blood_group: BloodGroup | null;
  date_of_joining: string;
  designation: string;
  photo_path: string | null;
  status: 'active' | 'inactive';
  inactive_from: string | null;
  auth_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalaryRevision {
  id: string;
  employee_id: string;
  monthly_salary: number;
  effective_date: string;
  reason: string | null;
  created_at: string;
}

export type AttendanceStatus = 'present' | 'half_day' | 'absent';

export interface Attendance {
  id: string;
  employee_id: string;
  work_date: string;
  status: AttendanceStatus;
  sign_in_at: string | null;
  sign_out_at: string | null;
  total_minutes: number;
  is_late: boolean;
  late_minutes: number;
  late_exception: boolean;
  late_exception_reason: string | null;
  late_exception_at: string | null;
  source: 'portal' | 'admin';
  auto_signed_out: boolean;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceSession {
  id: string;
  attendance_id: string;
  employee_id: string;
  login_at: string;
  logout_at: string | null;
  user_agent: string | null;
  closed_by: 'employee' | 'admin' | 'system' | null;
}

export interface AttendanceHistory {
  id: string;
  attendance_id: string | null;
  employee_id: string;
  work_date: string;
  action: string;
  old_data: Partial<Attendance> | null;
  new_data: Partial<Attendance> | null;
  reason: string | null;
  changed_by: string | null;
  changed_at: string;
}

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  is_paid: boolean;
  annual_quota: number | null;
  min_notice_days: number;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  attachment_path: string | null;
  status: LeaveStatus;
  admin_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export type HolidayCategory = 'festival' | 'national' | 'state' | 'optional';
export const HOLIDAY_CATEGORIES: { value: HolidayCategory; label: string }[] = [
  { value: 'festival', label: 'Festival Holiday' },
  { value: 'national', label: 'Government / National Holiday' },
  { value: 'state', label: 'State Government Holiday' },
  { value: 'optional', label: 'Optional Holiday' },
];

export interface Holiday {
  id: string;
  name: string;
  holiday_date: string;
  category: HolidayCategory;
  is_paid: boolean;
  applies_to_all: boolean;
  description: string | null;
  holiday_employees?: { employee_id: string }[];
}

export interface DefaultHoliday {
  id: string;
  name: string;
  holiday_date: string;
  category: HolidayCategory;
  description: string | null;
  is_tentative: boolean;
}

export type PenaltyCategory =
  | 'late_coming' | 'absence' | 'misconduct' | 'policy_violation' | 'damage' | 'performance' | 'other';
export const PENALTY_CATEGORIES: { value: PenaltyCategory; label: string }[] = [
  { value: 'late_coming', label: 'Late coming' },
  { value: 'absence', label: 'Unauthorised absence' },
  { value: 'misconduct', label: 'Misconduct' },
  { value: 'policy_violation', label: 'Policy violation' },
  { value: 'damage', label: 'Damage / loss of property' },
  { value: 'performance', label: 'Performance' },
  { value: 'other', label: 'Other' },
];

export interface Penalty {
  id: string;
  employee_id: string;
  penalty_date: string;
  category: PenaltyCategory;
  penalty_type: 'financial' | 'warning';
  reason: string;
  amount: number;
  deduction_year: number;
  deduction_month: number;
  status: 'active' | 'waived';
  waived_reason: string | null;
  notes: string | null;
  created_at: string;
}

export interface SalaryAdjustment {
  id: string;
  employee_id: string;
  year: number;
  month: number;
  adj_type: 'addition' | 'deduction';
  amount: number;
  reason: string;
  created_at: string;
}

export interface PayrollRecord {
  id: string;
  employee_id: string;
  year: number;
  month: number;
  payable_days: number;
  gross_earned: number;
  total_penalties: number;
  total_deductions: number;
  total_additions: number;
  net_salary: number;
  calc: unknown;
  finalized_at: string;
}

export interface AuditLog {
  id: number;
  table_name: string;
  record_id: string | null;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  reason: string | null;
  actor_id: string | null;
  created_at: string;
}
