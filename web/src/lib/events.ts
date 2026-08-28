"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchActivity,
  listEventIds,
  loadEvent,
  type Activity,
  type ActivityFeedResult,
  type EventState,
} from "./chain";
import { readIndexedEvents, toEventState } from "./event-index";
import { mergeActivity, reachesCreation, readArchivedActivity } from "./activity-archive";

/**
 * The React side of reading events: polling hooks, and nothing else.
 *
 * The reads themselves live in `./chain`, which carries no `"use client"` and
 * can therefore run on the server too — `/api/events/sync` needs exactly that.
 * Re-exported here so every existing call site keeps importing from one place.
 */
export {
  activityId,
  attendanceOf,
  fetchActivity,
  forfeitPool,
  isKnownEvent,
  listEventIds,
  loadEvent,
  server,
  spotsLeft,
} from "./chain";
export type { Activity, ActivityFeedResult, EventState, Phase } from "./chain";

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
function usePolled<T>(load: () => Promise<T>, intervalMs: number) {
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

/** An event as listed, and how much to trust it. */
export type ListedEvent = EventState & {
  source: "chain" | "index";
  /** ms since epoch of the index snapshot. Only set when `source` is "index". */
  syncedAt?: number;
};

export type EventList = {
  events: ListedEvent[];
  /** Events the factory knows about that neither the chain nor the index could answer for. */
  unreadable: string[];
};

/**
 * The event list, assembled so that one bad read cannot empty the page.
 *
 * This used to be `Promise.all(ids.map(loadEvent))`, which meant a single
 * unreadable event rejected the whole batch and the list rendered as if no
 * events existed. Combined with Soroban archiving state after about a week, that
 * is what "the events keep disappearing" actually was.
 *
 * Now each event stands alone, and anything the chain cannot answer for falls
 * back to the off-chain index — clearly marked, because a snapshot from twenty
 * minutes ago is worth showing but is not worth mistaking for live state.
 */
export async function loadEventList(): Promise<EventList> {
  let ids: string[] | null = null;
  try {
    ids = await listEventIds();
  } catch {
    // The factory itself is unreadable. Rare, and exactly when the index earns
    // its keep — but it is a genuine outage, so say nothing false about it.
    ids = null;
  }

  if (ids === null) {
    const indexed = await readIndexedEvents();
    if (indexed.length === 0) {
      throw new Error("Couldn't reach the network, and there's nothing cached to fall back on.");
    }
    return {
      events: indexed.map((doc) => ({
        ...toEventState(doc),
        source: "index" as const,
        syncedAt: doc.syncedAt,
      })),
      unreadable: [],
    };
  }

  const settled = await Promise.allSettled(ids.map(loadEvent));

  // Slots rather than pushes, so the factory's ordering survives a partial
  // failure — the page relies on it to put the newest event first.
  const slots: (ListedEvent | null)[] = settled.map((result) =>
    result.status === "fulfilled" ? { ...result.value, source: "chain" as const } : null,
  );
  const gaps = ids.filter((_, i) => slots[i] === null);
  const unreadable: string[] = [];

  if (gaps.length > 0) {
    const byId = new Map((await readIndexedEvents()).map((doc) => [doc.id, doc]));
    ids.forEach((id, i) => {
      if (slots[i] !== null) return;
      const doc = byId.get(id);
      if (doc) {
        slots[i] = { ...toEventState(doc), source: "index", syncedAt: doc.syncedAt };
      } else {
        unreadable.push(id);
      }
    });
  }

  return { events: slots.filter((e): e is ListedEvent => e !== null), unreadable };
}

export function useEventList(intervalMs = 10_000) {
  const load = useCallback(() => loadEventList(), []);
  return usePolled(load, intervalMs);
}

export function useEvent(id: string, intervalMs = 5_000) {
  const load = useCallback(() => loadEvent(id), [id]);
  return usePolled(load, intervalMs);
}

/**
 * The feed: the last day off the chain, on top of everything ever archived.
 *
 * The two are fetched on completely different rhythms because they change on
 * completely different rhythms. The chain feed is polled, since a reservation
 * made ten seconds ago has to appear; the archive is read once per event, since
 * a row can only enter it after `/api/events/sync` has copied it — by which
 * point the live feed already has it anyway.
 *
 * Everything the archive adds is therefore *older* than everything the poll
 * returns, which is the whole point: this is how an event from three months ago
 * still shows the twelve reservations and eleven check-ins that a reviewer is
 * being asked to go and verify, long after Soroban RPC dropped the ledgers.
 */
export function useActivity(id: string, intervalMs = 5_000) {
  const load = useCallback(() => fetchActivity(id), [id]);
  const live = usePolled(load, intervalMs);

  // Stamped with the event it was read for, rather than cleared when `id`
  // changes: clearing means a setState in the effect body, and one event's
  // history appearing under another's is exactly what that clear was guarding
  // against. Carrying the id makes the guard a comparison instead.
  const [archived, setArchived] = useState<{ id: string; rows: Activity[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    readArchivedActivity(id)
      .then((rows) => {
        if (!cancelled) setArchived({ id, rows });
      })
      // Silent: the archive is an accelerator. Failing to read it leaves the
      // feed exactly as it was before the archive existed, which is a working
      // feed, and there is nothing the reader could do about it anyway.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  const data = useMemo<ActivityFeedResult>(() => {
    const rows = archived?.id === id ? archived.rows : [];
    const activity = mergeActivity(live.data?.activity ?? [], rows);
    return {
      activity,
      // A feed holding the event's own creation has nothing missing below it,
      // whatever the live sweep managed to reach.
      truncated: (live.data?.truncated ?? false) && !reachesCreation(activity),
    };
  }, [live.data, archived, id]);

  return { ...live, data };
}
