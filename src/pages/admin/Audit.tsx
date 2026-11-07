import { useState } from 'react';
import { Alert, Badge, Button, Card, EmptyState, Loading, PageHeader, Select, Table, Td, Th } from '../../components/ui';
import { fetchEmployees } from '../../lib/api';
import { formatDateTime } from '../../lib/dates';
import { useData } from '../../lib/hooks';
import { must, supabase } from '../../lib/supabase';
import type { AuditLog } from '../../lib/types';

const TABLES: Record<string, string> = {
  employees: 'Employees', employees_admin: 'Employee login / status', salary_revisions: 'Salary revisions', leave_requests: 'Leave requests',
  leave_types: 'Leave types', holidays: 'Holidays', penalties: 'Penalties', salary_adjustments: 'Salary adjustments',
  payroll_records: 'Payroll', org_settings: 'Settings',
};
const PAGE = 100;

function changes(l: AuditLog): string {
  if (l.action === 'insert') return 'created';
  if (l.action === 'delete') return 'deleted';
  if (!l.old_data || !l.new_data) return l.action.replace(/_/g, ' ');
  const keys = Object.keys(l.new_data).filter((k) => !['updated_at', 'calc'].includes(k) && JSON.stringify(l.old_data![k]) !== JSON.stringify(l.new_data![k]));
  return keys.map((k) => `${k}: ${fmt(l.old_data![k])} → ${fmt(l.new_data![k])}`).join('; ') || 'no field changes';
}
const fmt = (v: unknown) => (v === null || v === undefined ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export default function AuditPage() {
  const [table, setTable] = useState('');
  const [page, setPage] = useState(0);
  const { data, loading, error } = useData(async () => {
    let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (table) q = q.eq('table_name', table);
    const [logs, emps, profiles] = await Promise.all([
      must(q) as Promise<AuditLog[]>, fetchEmployees(),
      must(supabase.from('profiles').select('id, display_name, role')) as Promise<{ id: string; display_name: string | null; role: string }[]>,
    ]);
    return { logs, emps: new Map(emps.map((e) => [e.id, e])), actors: new Map(profiles.map((p) => [p.id, p])) };
  }, [table, page]);

  const subject = (l: AuditLog) => {
    const empId = (l.new_data?.employee_id ?? l.old_data?.employee_id ?? (l.table_name.startsWith('employees') ? l.record_id : null)) as string | null;
    const e = empId ? data?.emps.get(empId) : undefined;
    return e ? `${e.employee_code} – ${e.full_name}` : (l.new_data?.name ?? l.old_data?.name ?? '') as string;
  };

  return (
    <>
      <PageHeader title="Audit Log" subtitle="Every change to employees, salaries, leaves, holidays, penalties, adjustments, payroll and settings is recorded. Attendance changes are in Attendance → Modification history." />
      <Card bodyClassName="p-0">
        <div className="flex gap-3 border-b border-slate-100 p-4">
          <Select value={table} onChange={(e) => { setTable(e.target.value); setPage(0); }} className="w-64">
            <option value="">All areas</option>
            {Object.entries(TABLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        {loading ? <Loading /> : error ? <Alert tone="error" className="m-4">{error}</Alert> : !data?.logs.length ? <EmptyState title="No audit entries" /> : (
          <Table>
            <thead><tr><Th>When</Th><Th>Area</Th><Th>Action</Th><Th>Subject</Th><Th>Changes</Th><Th>Reason</Th><Th>By</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.logs.map((l) => (
                <tr key={l.id} className="align-top">
                  <Td className="text-xs text-slate-500">{formatDateTime(l.created_at)}</Td>
                  <Td>{TABLES[l.table_name] ?? l.table_name}</Td>
                  <Td><Badge tone={l.action === 'delete' ? 'red' : l.action === 'insert' ? 'green' : 'brand'}>{l.action.replace(/_/g, ' ')}</Badge></Td>
                  <Td className="text-xs">{subject(l)}</Td>
                  <Td className="max-w-md whitespace-normal break-words text-xs text-slate-600">{changes(l)}</Td>
                  <Td className="max-w-xs whitespace-normal text-xs">{l.reason}</Td>
                  <Td className="text-xs">{l.actor_id ? (data.actors.get(l.actor_id)?.display_name ?? data.actors.get(l.actor_id)?.role ?? '—') : 'system'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <div className="flex justify-between border-t border-slate-100 px-4 py-3">
          <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</Button>
          <span className="text-xs text-slate-500">Page {page + 1}</span>
          <Button size="sm" variant="secondary" disabled={(data?.logs.length ?? 0) < PAGE} onClick={() => setPage(page + 1)}>Older</Button>
        </div>
      </Card>
    </>
  );
}
