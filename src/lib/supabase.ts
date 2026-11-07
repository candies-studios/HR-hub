import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'hr-portal-auth' },
});

export const EMPLOYEE_EMAIL_DOMAIN = ((import.meta.env.VITE_EMPLOYEE_EMAIL_DOMAIN as string | undefined) ?? 'staff.yourcompany.com')
  .trim()
  .toLowerCase();

export const employeeLoginEmail = (employeeCode: string) => `${employeeCode.trim().toLowerCase()}@${EMPLOYEE_EMAIL_DOMAIN}`;

/** Turn a Supabase / Postgres error into a readable message. */
export function errMsg(e: unknown): string {
  if (!e) return 'Unknown error';
  if (typeof e === 'string') return e;
  const anyE = e as { message?: string; details?: string; hint?: string };
  const msg = anyE.message ?? String(e);
  if (msg.includes('duplicate key')) return 'This record already exists.';
  if (msg.includes('violates row-level security')) return 'You are not allowed to perform this action.';
  return msg;
}

/** Throw on Supabase error, return data. */
export async function must<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(errMsg(error));
  return data as T;
}

/** Call the privileged admin-employees edge function. */
export async function adminEmployees<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-employees', { body });
  if (error) {
    // try to extract the JSON error from the function response
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = await ctx.json();
        if (j?.error) throw new Error(j.error);
      } catch (inner) {
        if (inner instanceof Error && inner.message) throw inner;
      }
    }
    throw new Error(errMsg(error));
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

export async function signedUrl(bucket: string, path: string | null | undefined, seconds = 3600) {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}
