"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchActivity,
  listEventIds,
  loadApplicants,
  loadEvent,
  loadStanding,
  loadVouches,
  type Activity,
  type ActivityFeedResult,
  type EventState,
} from "./chain";
import {
  forgetIndexCache,
  readIndexedEventsCached,
  requestSync,
  toEventState,
  type IndexedEvent,
} from "./event-index";
import { hiddenIds } from "./listing";
import { loadRecordForDisplay } from "./record-index";
import { usePolled } from "./polled";
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
  loadApplicants,
  loadEvent,
  loadStanding,
  server,
  spotsLeft,
} from "./chain";
export type { Activity, ActivityFeedResult, EventState, Phase } from "./chain";

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
 *
 * What the factory returns is filtered by the hidden list before anything else
 * happens: see `./listing`. That ordering is deliberate. A hidden event is never
 * fetched, so it costs no RPC call, and it can never turn up in `unreadable` and
 * be reported to the visitor as an event that failed to load.
 */
/** Never ask the server to sync more often than this, whatever else is true. */
const SYNC_MIN_GAP_MS = 60_000;

/** How often to refresh an index that already knows about every event. */
const SYNC_IDLE_GAP_MS = 5 * 60_000;

let lastSyncAt = 0;

/**
 * Keep the index populated from the page that reads the chain anyway.
 *
 * Until now the only things that wrote `events/{id}` were opening one event's
 * page and the nightly sweep, so an event nobody had opened yet simply had no
 * document — and the `hidden` flag has nowhere to live until it does. The home
 * page reads every event off the chain on every poll; this hands that read to
 * the server so it can be written down.
 *
 * Fire-and-forget, and deliberately not on every tick. The rule is not a plain
 * timer: **an id the index has never seen syncs within the minute**, because
 * that is somebody's event that has just been created and is missing from the
 * one place it can be curated from. Everything else waits five minutes, since
 * re-indexing state nobody has changed is a Firestore write for nothing.
 *
 * The floor applies either way, so a sync that keeps failing — an index that is
 * not configured, a server that is down — retries once a minute rather than on
 * every poll.
 */
function syncIndexIfStale(chainIds: string[], indexed: IndexedEvent[], now: number) {
  const since = now - lastSyncAt;
  if (since < SYNC_MIN_GAP_MS) return;

  const known = new Set(indexed.map((doc) => doc.id));
  const unseen = chainIds.some((id) => !known.has(id));
  if (!unseen && since < SYNC_IDLE_GAP_MS) return;

  lastSyncAt = now;
  // Drop the cache afterwards so the next poll reads what was just written,
  // rather than serving the pre-sync snapshot for the rest of the minute.
  void requestSync().then(forgetIndexCache);
}

export async function loadEventList(): Promise<EventList> {
  // One index read serves both jobs: it carries the `hidden` flags, and it is
  // the fallback for anything the chain cannot answer for. Before this it was
  // fetched only on the failure path, and twice when that path was taken.
  const [idsOrNull, indexed] = await Promise.all([
    listEventIds().catch(() => {
      // The factory itself is unreadable. Rare, and exactly when the index earns
      // its keep — but it is a genuine outage, so say nothing false about it.
      return null;
    }),
    readIndexedEventsCached(),
  ]);
  const hidden = hiddenIds(indexed);

  if (idsOrNull === null) {
    const visible = indexed.filter((doc) => !hidden.has(doc.id));
    if (visible.length === 0) {
      throw new Error("Couldn't reach the network, and there's nothing cached to fall back on.");
    }
    return {
      events: visible.map((doc) => ({
        ...toEventState(doc),
        source: "index" as const,
        syncedAt: doc.syncedAt,
      })),
      unreadable: [],
    };
  }

  syncIndexIfStale(idsOrNull, indexed, Date.now());

  const ids = idsOrNull.filter((id) => !hidden.has(id));
  const settled = await Promise.allSettled(ids.map((id) => loadEvent(id)));

  // Slots rather than pushes, so the factory's ordering survives a partial
  // failure — the page relies on it to put the newest event first.
  const slots: (ListedEvent | null)[] = settled.map((result) =>
    result.status === "fulfilled" ? { ...result.value, source: "chain" as const } : null,
  );
  const unreadable: string[] = [];

  if (slots.some((slot) => slot === null)) {
    const byId = new Map(indexed.map((doc) => [doc.id, doc]));
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

/**
 * The connected wallet's standing, polled only when it can change anything.
 *
 * `enabled` is false for every open and score-gated event, because there the
 * answer is already in the reserved and checked-in lists the page has. Asking
 * anyway would be an extra RPC read every few seconds on the majority of
 * events, for a value nothing renders.
 */
export function useStanding(
  id: string,
  address: string | null,
  enabled: boolean,
  intervalMs = 5_000,
) {
  const load = useCallback(
    () => (address && enabled ? loadStanding(id, address) : Promise.resolve(null)),
    [id, address, enabled],
  );
  return usePolled(load, intervalMs);
}

/**
 * This wallet's whole record on the show-up ledger, for showing on screen.
 *
 * Not per event: the ledger is one address for all of them, which is the point of
 * a score gate. `null` until it answers, and `null` again if it cannot — a wallet
 * shown an empty record it never earned would be told it fails a gate it may well
 * pass.
 *
 * Goes through the mirror rather than the contract, because this poll is a
 * *display*. The contract checks the real number inside `rsvp` and that is the
 * only opinion that decides anything; polling RPC to render it would make an open
 * tab cost a round trip every fifteen seconds for a figure that changes when
 * somebody checks in. See `loadRecordForDisplay`.
 */
export function useRecord(
  address: string | null,
  enabled: boolean,
  intervalMs = 15_000,
) {
  const load = useCallback(
    () => (address && enabled ? loadRecordForDisplay(address) : Promise.resolve(null)),
    [address, enabled],
  );
  return usePolled(load, intervalMs);
}

/**
 * How many vouches this wallet has at this event, polled while it needs them.
 *
 * `null` until the first answer, and `null` again for a wallet that isn't
 * connected — never 0, because "nobody has vouched for you" and "we haven't
 * asked yet" would otherwise both render as a gate the guest cannot pass.
 */
export function useVouches(
  id: string,
  address: string | null,
  enabled: boolean,
  intervalMs = 5_000,
) {
  const load = useCallback(
    () => (address && enabled ? loadVouches(id, address) : Promise.resolve(null)),
    [id, address, enabled],
  );
  return usePolled(load, intervalMs);
}

/**
 * The host's pending queue, polled while there is somebody in it to poll for.
 *
 * `candidates` is a fresh array on every render, so the key is what it contains
 * rather than its identity — otherwise the callback changes every tick and the
 * poll restarts forever.
 */
export function useApplicants(
  id: string,
  candidates: string[],
  enabled: boolean,
  intervalMs = 10_000,
) {
  const key = candidates.join(",");
  const load = useCallback(
    () => (enabled && key ? loadApplicants(id, key.split(",")) : Promise.resolve([])),
    [id, key, enabled],
  );
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
