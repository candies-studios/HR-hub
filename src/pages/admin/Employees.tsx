import { ArrowDown, ArrowUp, Download, Plus, Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Card, EmptyState, Input, Loading, PageHeader, Select, Table, Td, Th } from '../../components/ui';
import { fetchEmployees, fetchRevisions } from '../../lib/api';
import { currentYearMonth, formatDate, todayIST } from '../../lib/dates';
import { downloadCSV } from '../../lib/export';
import { money } from '../../lib/format';
import { useData } from '../../lib/hooks';
import { dailySalary, salaryOn } from '../../lib/salary';
import { BLOOD_GROUPS, type Employee } from '../../lib/types';

type SortKey = 'employee_code' | 'full_name' | 'designation' | 'date_of_joining' | 'salary';

export default function Employees() {
  const navigate = useNavigate();
  const { data, loading, error } = useData(async () => {
    const [employees, revisions] = await Promise.all([fetchEmployees(), fetchRevisions()]);
    return { employees, revisions };
  }, []);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('active');
  const [designation, setDesignation] = useState('');
  const [blood, setBlood] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'employee_code', dir: 1 });

  const today = todayIST();
  const { year, month } = currentYearMonth();
  const salaryOf = (e: Employee) => (data ? salaryOn(data.revisions.filter((r) => r.employee_id === e.id), today) : 0);

  const designations = useMemo(() => [...new Set((data?.employees ?? []).map((e) => e.designation))].sort(), [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    return data.employees
      .filter((e) => status === 'all' || e.status === status)
      .filter((e) => !designation || e.designation === designation)
      .filter((e) => !blood || e.blood_group === blood)
      .filter((e) => !s || [e.employee_code, e.full_name, e.email, e.phone, e.designation].some((v) => v?.toLowerCase().includes(s)))
      .sort((a, b) => {
        const va = sort.key === 'salary' ? salaryOf(a) : a[sort.key];
        const vb = sort.key === 'salary' ? salaryOf(b) : b[sort.key];
        return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, q, status, designation, blood, sort]);

  const toggleSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }));
  const SortIcon = ({ k }: { k: SortKey }) => (sort.key === k ? (sort.dir === 1 ? <ArrowUp className="ml-1 inline h-3 w-3" /> : <ArrowDown className="ml-1 inline h-3 w-3" />) : null);

  const exportCsv = () =>
    downloadCSV(`employees-${today}.csv`,
      ['Employee ID', 'Name', 'Designation', 'Status', 'DOB', 'DOJ', 'Email', 'Phone', 'Alt. Phone', 'Alt. Relation', 'Blood Group', 'Monthly Salary'],
      rows.map((e) => [e.employee_code, e.full_name, e.designation, e.status, e.date_of_birth, e.date_of_joining, e.email, e.phone, e.alt_phone, e.alt_contact_relation, e.blood_group, salaryOf(e)]));

  return (
    <>
      <PageHeader
        title="Employee Directory"
        subtitle={data ? `${data.employees.filter((e) => e.status === 'active').length} active · ${data.employees.length} total` : undefined}
        actions={<>
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>
          <Link to="/admin/employees/new"><Button icon={<Plus className="h-4 w-4" />}>Add Employee</Button></Link>
        </>}
      />
      <Card bodyClassName="p-0">
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ID, phone, e-mail…" className="pl-9" />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All statuses</option>
          </Select>
          <Select value={designation} onChange={(e) => setDesignation(e.target.value)}>
            <option value="">All designations</option>
            {designations.map((d) => <option key={d}>{d}</option>)}
          </Select>
          <Select value={blood} onChange={(e) => setBlood(e.target.value)}>
            <option value="">All blood groups</option>
            {BLOOD_GROUPS.map((b) => <option key={b}>{b}</option>)}
          </Select>
        </div>
        {loading ? <Loading /> : error ? <Alert tone="error" className="m-4">{error}</Alert> : !rows.length ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title="No employees found">Try changing the filters, or add your first employee.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th onClick={() => toggleSort('employee_code')}>ID<SortIcon k="employee_code" /></Th>
                <Th onClick={() => toggleSort('full_name')}>Name<SortIcon k="full_name" /></Th>
                <Th onClick={() => toggleSort('designation')}>Designation<SortIcon k="designation" /></Th>
                <Th>Contact</Th>
                <Th onClick={() => toggleSort('date_of_joining')}>Joined<SortIcon k="date_of_joining" /></Th>
                <Th onClick={() => toggleSort('salary')} className="text-right">Monthly / Daily<SortIcon k="salary" /></Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((e) => {
                const sal = salaryOf(e);
                return (
                  <tr key={e.id} onClick={() => navigate(`/admin/employees/${e.id}`)} className="cursor-pointer hover:bg-slate-50">
                    <Td className="font-mono text-xs font-semibold text-brand-700">{e.employee_code}</Td>
                    <Td><span className="font-medium text-slate-900">{e.full_name}</span>{e.blood_group && <span className="ml-2 text-xs text-red-600">{e.blood_group}</span>}</Td>
                    <Td>{e.designation}</Td>
                    <Td><div>{e.phone}</div><div className="text-xs text-slate-500">{e.email}</div></Td>
                    <Td>{formatDate(e.date_of_joining)}</Td>
                    <Td className="text-right"><div className="font-medium">{money(sal)}</div><div className="text-xs text-slate-500">{money(dailySalary(sal, year, month))}/day</div></Td>
                    <Td><Badge tone={e.status === 'active' ? 'green' : 'grey'}>{e.status}</Badge></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
