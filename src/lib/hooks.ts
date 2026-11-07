import { useCallback, useEffect, useRef, useState } from 'react';
import { signedUrl } from './supabase';

/** Run an async loader, re-running when deps change. */
export function useData<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const run = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const d = await loader();
      if (id === seq.current) setData(d);
    } catch (e) {
      if (id === seq.current) setError((e as Error).message);
    } finally {
      if (id === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);
  return { data, error, loading, reload: run, setData };
}

/** Signed URL for a private storage object. */
export function useSignedUrl(bucket: string, path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!path) { setUrl(null); return; }
    signedUrl(bucket, path).then((u) => alive && setUrl(u));
    return () => { alive = false; };
  }, [bucket, path]);
  return url;
}
