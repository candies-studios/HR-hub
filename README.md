# HR Management, Attendance & Salary Portal

A production-ready HR portal for Indian organisations: employee profiles, automatic login-based attendance (IST), leave management, holiday calendars, penalties, salary calculation with effective-dated revisions, payroll finalisation and PDF salary slips.

**Stack:** React 18 + TypeScript · Vite · Tailwind CSS · Supabase (Postgres, Auth, Storage, Edge Functions, RLS) · Recharts · Lucide · jsPDF

---

## Features

| Area | What it does |
|---|---|
| **Auth** | Employees log in with **Employee ID + DOB (DDMMYYYY)** on first login and are **forced to change the password**. Admins have a separate e-mail login. Passwords live only in Supabase Auth (bcrypt). |
| **Admin dashboard** | Total / present / absent / on-leave / late / half-day counts for today, month-to-date payroll, penalties; charts for attendance trend, present vs absent, half-days & late arrivals, monthly salary expenditure; quick actions. |
| **Employees** | Auto IDs (`CAN001`, `CAN002`…), full profile incl. blood group, alternate contact & relation, optional photo; directory with search, filters, sorting, CSV export; edit, revise salary/designation, reset password, deactivate (login is blocked). |
| **Attendance** | Logging in records the sign-in (server time, IST); signing out records sign-out and duration. One record per employee per day; multiple logins only add sessions. **≤ 10:00 → Present, later → Half Day** (configurable time / grace). Admin can approve a late arrival as an **exception**, mark/edit/delete attendance (mandatory reason), bulk-mark, fix forgotten logouts. Full modification history. Views by date, monthly register, by employee (colour calendar), yearly summary. |
| **Leave** | Apply with dates, type, reason, auto-counted days (weekly offs & holidays excluded), optional attachment. Pending → Approved / Rejected / Cancelled. Per-type paid/unpaid, annual quota and advance-notice rules enforced in the database. |
| **Holidays & policy** | Holiday calendar per year with categories (Festival, National, State, Optional), paid/unpaid, all or selected employees; copy from previous year; **reference list of Indian holidays that is never applied automatically** — admin reviews and imports. Leave policy + calendar visible to employees. |
| **Penalties** | Financial (deducted once in a chosen month) or warning-only; waive or delete with audit. |
| **Payroll** | Daily salary = monthly ÷ calendar days (28/29/30/31). Payable days = full + ½ × half + paid leave (+ paid holidays / weekly offs as configured). Net = earned − penalties − deductions + additions. Day-by-day breakdown, exceptional adjustments with reason, **finalise** (frozen snapshot, month locked), unlock with reason, PDF salary slips (single or bulk), CSV / PDF register. |
| **Reports** | Attendance summary, attendance log, payroll register, leave, penalties, employee directory, holiday calendar → CSV (Excel-friendly) or PDF. |
| **Audit** | Every change to employees, salaries, leaves, holidays, penalties, adjustments, payroll and settings is logged with actor and reason. |

---

## 1. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. **Authentication → Providers → Email**: keep Email enabled, **turn OFF "Allow new users to sign up"** (accounts are created by admins only). "Confirm email" can stay on – employee accounts are created pre-confirmed.
3. Note your **Project URL**, **anon key** and **project ref** (Project Settings → API).

## 2. Apply the database

Using the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
npm i -g supabase            # or use npx supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push             # runs supabase/migrations/*.sql in order
```

Alternatively, paste the four files in `supabase/migrations/` into the SQL Editor **in order**.

## 3. Deploy the edge function

```bash
supabase secrets set EMPLOYEE_EMAIL_DOMAIN=staff.yourcompany.com
supabase functions deploy admin-employees
```

`EMPLOYEE_EMAIL_DOMAIN` builds a hidden login e-mail for each employee (`CAN001` → `can001@staff.yourcompany.com`). No mail is ever sent to it; use a sub-domain you own. It **must match** `VITE_EMPLOYEE_EMAIL_DOMAIN` in the frontend.

## 4. Create the first admin

1. **Authentication → Users → Add user** → enter e-mail + password, tick *Auto confirm*.
2. In the **SQL Editor** run:
   ```sql
   select public.make_admin('hr@yourcompany.com', 'HR Admin');
   ```
   (`make_admin` can only be executed from the SQL editor / service role.)

## 5. Run the frontend

```bash
cp .env.example .env         # fill in URL, anon key, e-mail domain
npm install
npm run dev                  # http://localhost:5173
```

- Employee login: `/login` · Admin login: `/admin/login`

## 6. Deploy the frontend

Any static host works. Build command `npm run build`, output `dist`, and set the three `VITE_*` environment variables.
SPA routing is pre-configured for **Vercel** (`vercel.json`) and **Netlify** (`public/_redirects`).

### GitHub Pages

GitHub Pages cannot run the source code directly – it must serve the **built** `dist` folder. The workflow `.github/workflows/deploy-pages.yml` does this automatically:

1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Repo **Settings → Secrets and variables → Actions → New repository secret**, add:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_EMPLOYEE_EMAIL_DOMAIN`.
3. Push to `main` (or run the workflow manually from the **Actions** tab). The site is built with the correct sub-path (`/<repo-name>/`) and a `404.html` fallback so deep links work.
4. In Supabase **Authentication → URL Configuration**, set the Site URL to your Pages URL.

---

## First-run checklist (admin)

1. **Settings** – company name/address (printed on slips), reporting time (default 10:00), grace minutes, weekly off days and whether they are paid.
2. **Holidays & Leave Policy** – review the default Indian holiday list and import only what your organisation observes (verify tentative lunar dates); adjust leave types, quotas and notice periods.
3. **Employees → Add Employee** – the employee's initial password is their DOB as `DDMMYYYY`.

---

## How the rules are implemented

### Attendance
- `employee_sign_in()` (Postgres function) runs on login using **database time** converted to IST, so the client clock cannot be manipulated. It inserts the day's record if missing (`unique(employee_id, work_date)`) and always adds a session row.
- `employee_sign_out(session_id)` closes **that** login session; the sign-out is attached to the attendance day the session belongs to (works across midnight).
- A session that survives overnight shows a "Sign in for today" banner rather than silently creating attendance.
- Admin changes go through `admin_save_attendance`, `admin_set_late_exception`, `admin_delete_attendance` – each validates input, requires a reason and writes `attendance_history`.

### Salary (`src/lib/salary.ts`, unit-tested)
Each calendar day is classified exactly once — **attendance › holiday › weekly off › approved leave › absent** — so nothing is deducted twice (e.g. a late arrival is only the half-day deduction; a holiday inside a leave doesn't consume leave). Each day is paid at the salary in force on that day, so revisions are effective-dated and never alter earlier months. Amounts are rounded to 2 decimals at the end (full attendance always equals the monthly salary exactly).

Example, ₹30,000/month: Feb 2026 → ₹1,071.43/day · Apr → ₹1,000.00 · Mar → ₹967.74 · Feb 2028 (leap) → ₹1,034.48.

### Finalisation & locking
Finalising stores a JSON snapshot in `payroll_records`; slips are generated from that snapshot. While a month is finalised the database rejects attendance edits, leave approvals, penalties, adjustments and salary revisions that would affect it. Unlocking requires a reason and is audited.

### Security
- **RLS on every table.** Employees can read only rows where `employee_id = my_employee_id()`; changing URLs or calling the REST API directly returns nothing else.
- Attendance has **no client write policies** – only the validated `SECURITY DEFINER` functions can write.
- Employee ID, login link and status can only be changed by the `admin-employees` edge function (service role), which also bans deactivated logins.
- Files are in **private** buckets (`avatars`, `leave-attachments`) accessed via short-lived signed URLs, scoped per employee folder.
- `make_admin` and `generate_employee_code` are not callable by clients.

---

## Project structure

```
supabase/
  migrations/              schema, functions & triggers, RLS & storage, default data
  functions/admin-employees/  create employee + login, reset password, activate/deactivate
src/
  lib/                     salary engine (+tests), IST date utils, data loaders, PDF & CSV export
  contexts/AuthContext.tsx login/logout incl. attendance sign-in/out
  components/              UI kit, attendance calendar, attendance editor
  pages/admin/             dashboard, employees, attendance, leaves, holidays, penalties, payroll, reports, audit, settings
  pages/employee/          dashboard, attendance, leaves, salary, policy, profile
```

## Scripts

| Command | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | type-check + production build |
| `npm test` | salary-engine unit tests (Vitest) |
| `npm run typecheck` | TypeScript only |

## Notes & assumptions

- The specification's Penalty section was cut off after *Reason*; penalties were completed with category, financial/warning type, amount, deduction month, status (active/waived) and notes.
- Weekly offs are configurable (default Sunday, paid). Public holidays are paid/unpaid per holiday.
- Half-day *leave* is not modelled; half days come from attendance.
- Employees cannot edit their own profile (by design: HR-controlled data); they can change their password.
