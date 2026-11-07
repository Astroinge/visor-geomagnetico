import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  updated: Date | null;
  reload: () => void;
}

/**
 * Ejecuta `fn` al montar y cada `refreshMs` (si se indica). Cancela peticiones
 * obsoletas y conserva el último dato válido si una recarga falla.
 */
export function useAsync<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  refreshMs?: number,
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fnRef
      .current(ctrl.signal)
      .then((d) => {
        if (ctrl.signal.aborted) return;
        setData(d);
        setError(null);
        setUpdated(new Date());
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  useEffect(() => {
    if (!refreshMs) return;
    const id = setInterval(() => setTick((t) => t + 1), refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, updated, reload };
}
