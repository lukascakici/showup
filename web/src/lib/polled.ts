"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Poll a value on an interval, keeping the last good result on a failed tick.
 *
 * Three states, deliberately separate, because callers kept collapsing them:
 *
 *   loading    nothing has ever arrived — the only time a skeleton is honest
 *   refreshing a tick is in flight over data already on screen
 *   error      the last tick failed; `data` may still be good, just older
 *
 * `loading` used to be the only signal, and it goes false forever after the
 * first settle — so every later poll, successful or not, was invisible. An
 * `error` alongside live `data` is the case that matters: the numbers are real
 * but frozen, and only the caller can decide how loudly to say so.
 */
export function usePolled<T>(load: () => Promise<T>, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Callers pass a useCallback-stable loader, so depending on it directly keeps
  // the polling effect from restarting on every render.
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await load());
      setError(null);
    } catch (e) {
      // Keep whatever we last had on screen; a dropped poll isn't a failure the
      // user needs to see if the data is still good.
      setError(e instanceof Error ? e.message : "Couldn't reach the network.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (!cancelled) await refresh();
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refresh, intervalMs]);

  return { data, error, loading, refreshing, refresh };
}
