"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchActivity, listEventIds, loadEvent } from "./chain";

/**
 * The React side of reading events: polling hooks, and nothing else.
 *
 * The reads themselves live in `./chain`, which carries no `"use client"` and
 * can therefore run on the server too — `/api/events/sync` needs exactly that.
 * Re-exported here so every existing call site keeps importing from one place.
 */
export {
  attendanceOf,
  fetchActivity,
  forfeitPool,
  listEventIds,
  loadEvent,
  server,
  spotsLeft,
} from "./chain";
export type { Activity, EventState, Phase } from "./chain";

/** Poll a value on an interval, keeping the last good result on a failed tick. */
function usePolled<T>(load: () => Promise<T>, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Callers pass a useCallback-stable loader, so depending on it directly keeps
  // the polling effect from restarting on every render.
  const refresh = useCallback(async () => {
    try {
      setData(await load());
      setError(null);
    } catch (e) {
      // Keep whatever we last had on screen; a dropped poll isn't a failure the
      // user needs to see if the data is still good.
      setError(e instanceof Error ? e.message : "Couldn't reach the network.");
    } finally {
      setLoading(false);
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

  return { data, error, loading, refresh };
}

export function useEventList(intervalMs = 10_000) {
  const load = useCallback(async () => {
    const ids = await listEventIds();
    return Promise.all(ids.map(loadEvent));
  }, []);
  return usePolled(load, intervalMs);
}

export function useEvent(id: string, intervalMs = 5_000) {
  const load = useCallback(() => loadEvent(id), [id]);
  return usePolled(load, intervalMs);
}

export function useActivity(id: string, intervalMs = 5_000) {
  const load = useCallback(() => fetchActivity(id), [id]);
  return usePolled(load, intervalMs);
}
