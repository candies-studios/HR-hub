import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';

type Tone = 'success' | 'error' | 'info';
interface ToastItem { id: number; tone: Tone; message: string }

const Ctx = createContext<{ toast: (message: string, tone?: Tone) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const remove = (id: number) => setItems((x) => x.filter((t) => t.id !== id));
  const toast = useCallback((message: string, tone: Tone = 'success') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, tone, message }]);
    setTimeout(() => remove(id), tone === 'error' ? 7000 : 3500);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2">
        {items.map((t) => {
          const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? AlertCircle : Info;
          return (
            <div
              key={t.id}
              className={clsx(
                'pointer-events-auto flex items-start gap-3 rounded-lg border bg-white px-4 py-3 text-sm shadow-lg',
                t.tone === 'success' && 'border-emerald-200',
                t.tone === 'error' && 'border-red-200',
                t.tone === 'info' && 'border-sky-200',
              )}
            >
              <Icon className={clsx('mt-0.5 h-4 w-4 shrink-0', t.tone === 'success' ? 'text-emerald-600' : t.tone === 'error' ? 'text-red-600' : 'text-sky-600')} />
              <p className="flex-1 text-slate-700">{t.message}</p>
              <button onClick={() => remove(t.id)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast must be used inside ToastProvider');
  return c.toast;
}
