import { Copy, Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useToast } from '../../components/Toast';
import {
  Alert, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Loading, Modal, PageHeader, Select, Table, Tabs, Td, Textarea, Th,
} from '../../components/ui';
import { fetchEmployees, fetchHolidays, fetchLeaveTypes } from '../../lib/api';
import { currentYearMonth, dayOfWeek, formatDate, WEEKDAYS } from '../../lib/dates';
import { useData } from '../../lib/hooks';
import { errMsg, must, supabase } from '../../lib/supabase';
import { HOLIDAY_CATEGORIES, type DefaultHoliday, type Employee, type Holiday, type HolidayCategory, type LeaveType } from '../../lib/types';

type Tab = 'calendar' | 'import' | 'leave_types';
const catTone = (c: HolidayCategory) => (c === 'national' ? 'brand' : c === 'festival' ? 'orange' : c === 'state' ? 'violet' : 'grey') as 'brand' | 'orange' | 'violet' | 'grey';
export const catLabel = (c: HolidayCategory) => HOLIDAY_CATEGORIES.find((x) => x.value === c)?.label ?? c;

export default function HolidaysPage() {
  const [tab, setTab] = useState<Tab>('calendar');
  const [year, setYear] = useState(currentYearMonth().year);
  return (
    <>
      <PageHeader title="Holidays & Leave Policy" subtitle="Everything configured here is visible to employees on their Leave Policy page."
        actions={tab !== 'leave_types' && (
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28">
            {Array.from({ length: 5 }, (_, i) => currentYearMonth().year + 1 - i).map((y) => <option key={y}>{y}</option>)}
          </Select>
        )} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { value: 'calendar', label: `Holiday calendar ${year}` }, { value: 'import', label: 'Default Indian holidays' }, { value: 'leave_types', label: 'Paid & unpaid leave types' },
      ]} />
      {tab === 'calendar' && <HolidayCalendar year={year} />}
      {tab === 'import' && <ImportDefaults year={year} onImported={() => setTab('calendar')} />}
      {tab === 'leave_types' && <LeaveTypes />}
    </>
  );
}

// ------------------------------------------------------------------ calendar
function HolidayCalendar({ year }: { year: number }) {
  const toast = useToast();
  const [edit, setEdit] = useState<Holiday | 'new' | null>(null);
  const [del, setDel] = useState<Holiday | null>(null);
  const [copying, setCopying] = useState(false);
  const { data, loading, error, reload } = useData(async () => {
    const [holidays, employees] = await Promise.all([fetchHolidays(`${year}-01-01`, `${year}-12-31`), fetchEmployees()]);
    return { holidays, employees };
  }, [year]);

  const copyPrev = async () => {
    setCopying(true);
    try {
      const n = await must(supabase.rpc('copy_holidays', { p_from_year: year - 1, p_to_year: year }));
      toast(`${n} holiday(s) copied from ${year - 1}. Please verify dates of festivals, which change every year.`, 'info');
      reload();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setCopying(false); }
  };

  const remove = async () => {
    if (!del) return;
    try { await must(supabase.from('holidays').delete().eq('id', del.id)); toast('Holiday deleted'); setDel(null); reload(); }
    catch (e) { toast(errMsg(e), 'error'); }
  };

  const paidCount = data?.holidays.filter((h) => h.is_paid).length ?? 0;

  return (
    <Card title={data ? `${data.holidays.length} holidays · ${paidCount} paid` : 'Holidays'} bodyClassName="p-0"
      actions={<>
        <Button size="sm" variant="secondary" icon={<Copy className="h-3.5 w-3.5" />} loading={copying} onClick={copyPrev}>Copy from {year - 1}</Button>
        <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEdit('new')}>Add holiday</Button>
      </>}>
      {loading ? <Loading /> : error ? <Alert tone="error" className="m-4">{error}</Alert> : !data?.holidays.length ? (
        <EmptyState title={`No holidays configured for ${year}`}>Add holidays one by one, copy last year's, or review the default Indian holiday list.</EmptyState>
      ) : (
        <Table>
          <thead><tr><Th>Date</Th><Th>Day</Th><Th>Holiday</Th><Th>Category</Th><Th>Pay</Th><Th>Applies to</Th><Th className="text-right">Actions</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.holidays.map((h) => (
              <tr key={h.id}>
                <Td className="font-medium">{formatDate(h.holiday_date)}</Td>
                <Td>{WEEKDAYS[dayOfWeek(h.holiday_date)]}</Td>
                <Td><div className="font-medium text-slate-900">{h.name}</div>{h.description && <div className="text-xs text-slate-500">{h.description}</div>}</Td>
                <Td><Badge tone={catTone(h.category)}>{catLabel(h.category)}</Badge></Td>
                <Td><Badge tone={h.is_paid ? 'green' : 'grey'}>{h.is_paid ? 'Paid' : 'Unpaid'}</Badge></Td>
                <Td>{h.applies_to_all ? 'All employees' : `${h.holiday_employees?.length ?? 0} employee(s)`}</Td>
                <Td className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEdit(h)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDel(h)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {edit && data && <HolidayModal holiday={edit === 'new' ? null : edit} year={year} employees={data.employees} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
      {del && (
        <Modal open onClose={() => setDel(null)} title="Delete holiday" footer={<><Button variant="secondary" onClick={() => setDel(null)}>Cancel</Button><Button variant="danger" onClick={remove}>Delete</Button></>}>
          <p className="text-sm text-slate-600">Delete <b>{del.name}</b> on {formatDate(del.holiday_date)}? Payroll for the month will treat the day as a working day (already finalised salary slips are not affected).</p>
        </Modal>
      )}
    </Card>
  );
}

function HolidayModal({ holiday, year, employees, onClose, onDone }: { holiday: Holiday | null; year: number; employees: Employee[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: holiday?.name ?? '', holiday_date: holiday?.holiday_date ?? `${year}-01-01`, category: holiday?.category ?? 'festival' as HolidayCategory,
    is_paid: holiday?.is_paid ?? true, applies_to_all: holiday?.applies_to_all ?? true, description: holiday?.description ?? '',
  });
  const [assigned, setAssigned] = useState<Set<string>>(new Set(holiday?.holiday_employees?.map((x) => x.employee_id) ?? []));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const active = employees.filter((e) => e.status === 'active');

  const save = async () => {
    if (f.name.trim().length < 2) return setErr('Holiday name is required');
    if (!f.holiday_date) return setErr('Date is required');
    if (!f.applies_to_all && assigned.size === 0) return setErr('Select at least one employee, or apply to all');
    setBusy(true); setErr(null);
    try {
      const payload = { ...f, name: f.name.trim(), description: f.description.trim() || null };
      const saved = holiday
        ? await must(supabase.from('holidays').update(payload).eq('id', holiday.id).select().single()) as Holiday
        : await must(supabase.from('holidays').insert(payload).select().single()) as Holiday;
      await must(supabase.from('holiday_employees').delete().eq('holiday_id', saved.id));
      if (!f.applies_to_all) {
        await must(supabase.from('holiday_employees').insert([...assigned].map((employee_id) => ({ holiday_id: saved.id, employee_id }))));
      }
      toast(holiday ? 'Holiday updated' : 'Holiday added');
      onDone();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={holiday ? 'Edit holiday' : 'Add holiday'} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Holiday name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Date" required><Input type="date" value={f.holiday_date} onChange={(e) => setF({ ...f, holiday_date: e.target.value })} /></Field>
        <Field label="Category" required>
          <Select value={f.category} onChange={(e) => {
            const category = e.target.value as HolidayCategory;
            setF({ ...f, category, applies_to_all: category === 'optional' ? false : f.applies_to_all });
          }}>
            {HOLIDAY_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="Pay status" required>
          <Select value={f.is_paid ? 'paid' : 'unpaid'} onChange={(e) => setF({ ...f, is_paid: e.target.value === 'paid' })}>
            <option value="paid">Paid holiday (no salary deduction)</option><option value="unpaid">Unpaid holiday</option>
          </Select>
        </Field>
        <Field label="Description" className="sm:col-span-2"><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="sm:col-span-2">
          <Checkbox checked={f.applies_to_all} onChange={(v) => setF({ ...f, applies_to_all: v })} label="Applies to all employees" />
          {f.category === 'optional' && <p className="mt-1 text-xs text-slate-500">Optional holidays usually apply only to employees who opt for them.</p>}
          {!f.applies_to_all && (
            <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setAssigned(new Set(active.map((e) => e.id)))}>Select all</Button>
                <Button size="sm" variant="ghost" onClick={() => setAssigned(new Set())}>Clear</Button>
              </div>
              <div className="grid gap-1 sm:grid-cols-2">
                {active.map((e) => (
                  <Checkbox key={e.id} checked={assigned.has(e.id)} label={`${e.employee_code} – ${e.full_name}`}
                    onChange={(v) => setAssigned((s) => { const n = new Set(s); if (v) n.add(e.id); else n.delete(e.id); return n; })} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {err && <Alert tone="error" className="mt-3">{err}</Alert>}
    </Modal>
  );
}

// ------------------------------------------------------------------ import defaults
function ImportDefaults({ year, onImported }: { year: number; onImported: () => void }) {
  const toast = useToast();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const { data, loading, error } = useData(async () => {
    const [defs, existing] = await Promise.all([
      must(supabase.from('default_holidays').select('*').gte('holiday_date', `${year}-01-01`).lte('holiday_date', `${year}-12-31`).order('holiday_date')) as Promise<DefaultHoliday[]>,
      fetchHolidays(`${year}-01-01`, `${year}-12-31`),
    ]);
    return { defs, existing: new Set(existing.map((h) => `${h.holiday_date}|${h.name}`)) };
  }, [year]);

  const available = useMemo(() => data?.defs.filter((d) => !data.existing.has(`${d.holiday_date}|${d.name}`)) ?? [], [data]);

  const importSel = async () => {
    const rows = available.filter((d) => sel.has(d.id)).map((d) => ({
      name: d.name, holiday_date: d.holiday_date, category: d.category, is_paid: true,
      applies_to_all: d.category !== 'optional', description: d.description,
    }));
    if (!rows.length) return;
    setBusy(true);
    try {
      await must(supabase.from('holidays').insert(rows));
      toast(`${rows.length} holiday(s) added to the ${year} calendar`);
      onImported();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <Card title={`Reference list – Indian holidays ${year}`} bodyClassName="p-0"
      actions={<Button size="sm" icon={<Download className="h-3.5 w-3.5" />} disabled={!sel.size} loading={busy} onClick={importSel}>Add {sel.size || ''} selected to calendar</Button>}>
      <Alert tone="info" className="m-4">
        This list is <b>not applied automatically</b>. Select only the holidays your organisation observes. Lunar festival dates marked “tentative” must be verified against the official Central / State Government notification. You can edit dates, pay status and applicability after adding.
      </Alert>
      {loading ? <Loading /> : error ? <Alert tone="error" className="m-4">{error}</Alert> : !data?.defs.length ? (
        <EmptyState title={`No reference holidays for ${year}`}>Use “Copy from previous year” on the calendar tab, or add holidays manually.</EmptyState>
      ) : (
        <Table>
          <thead><tr>
            <Th><Checkbox label="" checked={available.length > 0 && available.every((d) => sel.has(d.id))} onChange={(v) => setSel(v ? new Set(available.map((d) => d.id)) : new Set())} /></Th>
            <Th>Date</Th><Th>Day</Th><Th>Holiday</Th><Th>Category</Th><Th>Note</Th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.defs.map((d) => {
              const added = data.existing.has(`${d.holiday_date}|${d.name}`);
              return (
                <tr key={d.id} className={added ? 'opacity-60' : ''}>
                  <Td>{added ? <Badge tone="green">added</Badge> : <Checkbox label="" checked={sel.has(d.id)} onChange={(v) => setSel((s) => { const n = new Set(s); if (v) n.add(d.id); else n.delete(d.id); return n; })} />}</Td>
                  <Td>{formatDate(d.holiday_date)}</Td><Td>{WEEKDAYS[dayOfWeek(d.holiday_date)]}</Td>
                  <Td className="font-medium">{d.name}</Td>
                  <Td><Badge tone={catTone(d.category)}>{catLabel(d.category)}</Badge></Td>
                  <Td className="text-xs text-slate-500">{d.description}{d.is_tentative && <Badge tone="yellow" className="ml-1">tentative</Badge>}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ leave types
function LeaveTypes() {
  const { data, loading, error, reload } = useData(() => fetchLeaveTypes(), []);
  const [edit, setEdit] = useState<LeaveType | 'new' | null>(null);
  return (
    <Card title="Leave types" bodyClassName="p-0" actions={<Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEdit('new')}>Add leave type</Button>}>
      {loading ? <Loading /> : error ? <Alert tone="error" className="m-4">{error}</Alert> : (
        <Table>
          <thead><tr><Th>Code</Th><Th>Name</Th><Th>Pay</Th><Th>Annual quota</Th><Th>Advance notice</Th><Th>Description</Th><Th>Status</Th><Th /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data?.map((t) => (
              <tr key={t.id}>
                <Td className="font-mono text-xs font-semibold">{t.code}</Td>
                <Td className="font-medium">{t.name}</Td>
                <Td><Badge tone={t.is_paid ? 'green' : 'grey'}>{t.is_paid ? 'Paid' : 'Unpaid'}</Badge></Td>
                <Td>{t.annual_quota ?? 'Unlimited'}</Td>
                <Td>{t.min_notice_days ? `${t.min_notice_days} day(s)` : 'Same day'}</Td>
                <Td className="max-w-xs whitespace-normal text-xs text-slate-500">{t.description}</Td>
                <Td><Badge tone={t.is_active ? 'green' : 'grey'}>{t.is_active ? 'active' : 'inactive'}</Badge></Td>
                <Td><Button size="sm" variant="ghost" onClick={() => setEdit(t)}><Pencil className="h-4 w-4" /></Button></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="px-5 py-3 text-xs text-slate-500">Paid leave counts as a payable day. Unpaid leave reduces payable days. Leave days exclude weekly offs and holidays. Employees must apply the configured number of days in advance; approval is required before leave counts as approved.</p>
      {edit && <LeaveTypeModal type={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
    </Card>
  );
}

function LeaveTypeModal({ type, onClose, onDone }: { type: LeaveType | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    code: type?.code ?? '', name: type?.name ?? '', is_paid: type?.is_paid ?? true, annual_quota: type?.annual_quota?.toString() ?? '',
    min_notice_days: String(type?.min_notice_days ?? 1), description: type?.description ?? '', is_active: type?.is_active ?? true, sort_order: String(type?.sort_order ?? 10),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (!/^[A-Z0-9_]{2,10}$/.test(f.code)) return setErr('Code: 2–10 capital letters/digits');
    if (f.name.trim().length < 2) return setErr('Name is required');
    setBusy(true); setErr(null);
    const payload = {
      code: f.code, name: f.name.trim(), is_paid: f.is_paid, annual_quota: f.annual_quota === '' ? null : Number(f.annual_quota),
      min_notice_days: Number(f.min_notice_days) || 0, description: f.description.trim() || null, is_active: f.is_active, sort_order: Number(f.sort_order) || 0,
    };
    try {
      if (type) await must(supabase.from('leave_types').update(payload).eq('id', type.id));
      else await must(supabase.from('leave_types').insert(payload));
      toast('Leave type saved');
      onDone();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={type ? 'Edit leave type' : 'Add leave type'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code" required><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} disabled={Boolean(type)} /></Field>
        <Field label="Name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Pay status">
          <Select value={f.is_paid ? 'paid' : 'unpaid'} onChange={(e) => setF({ ...f, is_paid: e.target.value === 'paid' })}>
            <option value="paid">Paid leave</option><option value="unpaid">Unpaid leave</option>
          </Select>
        </Field>
        <Field label="Annual quota (days)" hint="Leave blank for unlimited"><Input type="number" min="0" step="0.5" value={f.annual_quota} onChange={(e) => setF({ ...f, annual_quota: e.target.value })} /></Field>
        <Field label="Minimum advance notice (days)"><Input type="number" min="0" value={f.min_notice_days} onChange={(e) => setF({ ...f, min_notice_days: e.target.value })} /></Field>
        <Field label="Display order"><Input type="number" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} /></Field>
        <Field label="Description / policy text" className="sm:col-span-2"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Checkbox checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} label="Active (employees can apply)" />
      </div>
      {err && <Alert tone="error" className="mt-3">{err}</Alert>}
    </Modal>
  );
}

