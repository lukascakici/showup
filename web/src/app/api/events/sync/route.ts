import { NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";
import { FACTORY_ID } from "@/lib/contracts";
import { activityId, listEventIds, loadEvent, server, sweepEventActivity } from "@/lib/chain";
import { EVENTS_COLLECTION, type IndexedEvent } from "@/lib/event-index";
import {
  ACTIVITY_COLLECTION,
  reachesCreation,
  toArchived,
} from "@/lib/activity-archive";

/**
 * Refresh the off-chain index from the chain.
 *
 * **This endpoint accepts no data.** It takes at most an event id saying *what*
 * to refresh, then reads every field from the contract itself and writes what it
 * read. A caller cannot set a deposit, a guest list or a phase, so there is
 * nothing to gain by calling it dishonestly and nothing to protect with a login.
 *
 * That is a deliberate trade. The alternative — letting clients post event
 * metadata and proving they are the organizer — needs a wallet signature, and
 * Albedo, one of the four wallets this project promises, cannot sign messages
 * (`signMessage()` is stubbed out as SEP-0043 incompatible). Deriving everything
 * from the chain sidesteps the question rather than answering it badly for a
 * quarter of our users.
 *
 * The cost is that only chain-backed fields can be indexed. A title lives in the
 * event contract for exactly this reason.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * A first archive sweep pages back over the RPC's whole retained range — about
 * a week of ledgers, which took thirteen `getEvents` calls for the Deliverable 3
 * event. That is a minute's work in the worst case and it only happens once per
 * event, so the function is allowed the time rather than the archive being left
 * with a hole in it.
 */
export const maxDuration = 60;

/** Cap a full sweep so one call cannot run unbounded as the factory grows. */
const MAX_EVENTS_PER_SWEEP = 100;

/** Stop paging with room to spare inside `maxDuration`, and resume next call. */
const ARCHIVE_BUDGET_MS = 40_000;

/**
 * When the scheduled run stops picking up new events.
 *
 * Lower than `ARCHIVE_BUDGET_MS` on purpose: this is checked before starting an
 * event, and starting one with a few seconds left just gets it killed halfway.
 * Whatever it doesn't reach is at the front of the queue on the next run.
 */
const CRON_BUDGET_MS = 25_000;

/**
 * Re-scan this far below where the last sweep stopped.
 *
 * `sweptTo` comes from a cursor, and a cursor points into a ledger rather than
 * past it, so resuming exactly there could miss an event published later in the
 * same one. Rows are written under `activityId`, so an overlap costs a rewrite
 * of what is already there and nothing else.
 */
const ARCHIVE_OVERLAP_LEDGERS = 20;

/** Firestore commits at most 500 writes per batch. */
const MAX_BATCH_WRITES = 400;

export async function POST(request: Request) {
  const db = adminFirestore();
  if (!db) {
    // Not an error the caller did anything about, and not fatal: the app reads
    // the chain directly regardless.
    return NextResponse.json({ indexed: 0, reason: "index-not-configured" }, { status: 200 });
  }

  let id: string | undefined;
  try {
    const body = (await request.json()) as { id?: unknown };
    if (typeof body.id === "string") id = body.id;
  } catch {
    // No body means "sync everything", which is a valid request.
  }

  if (id !== undefined && !/^C[A-Z2-7]{55}$/.test(id)) {
    return NextResponse.json({ error: "not a contract address" }, { status: 400 });
  }

  const state = await indexState(db, id);
  if ("failed" in state) return state.failed;

  // Only ever for a named event. A factory-wide sweep would be one full history
  // page-through per event, which is minutes of RPC calls in a single request —
  // the scheduled GET below is what covers the rest, at its own pace.
  const activity =
    id && state.indexed > 0 ? await archiveActivity(db, id, state.syncedAt) : undefined;

  return NextResponse.json({
    indexed: state.indexed,
    unreadable: state.unreadable,
    truncated: state.truncated,
    syncedLedger: state.ledger,
    activity,
  });
}

/**
 * The scheduled sweep: keep every event's history, not just the visited ones.
 *
 * `/e/[id]` asks for a sync whenever it is opened, which covers any event
 * somebody is actually looking at. It does not cover an event nobody opens for
 * a week — and a week is exactly how long Soroban RPC keeps the ledgers its
 * history lives in, so that event would lose its transaction hashes for good
 * while its state sat there looking complete.
 *
 * So this runs on a schedule (see `vercel.json`) and works through the events by
 * how long it has been since each was last archived, oldest first, until it runs
 * out of time. Anything it doesn't reach today is first in line tomorrow, which
 * is many days inside the window that matters.
 *
 * GET because that is what Vercel Cron sends. It still accepts no data.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "not authorized" }, { status: 401 });
  }

  const db = adminFirestore();
  if (!db) {
    return NextResponse.json({ indexed: 0, reason: "index-not-configured" }, { status: 200 });
  }

  const state = await indexState(db);
  if ("failed" in state) return state.failed;

  // Never archived at all sorts first — those are the ones with something to
  // lose. After that, whichever was archived longest ago.
  const staleness = new Map<string, number>();
  try {
    const snapshot = await db
      .collection(EVENTS_COLLECTION)
      .where("factory", "==", FACTORY_ID)
      .get();
    for (const d of snapshot.docs) staleness.set(d.id, Number(d.get("activitySyncedAt") ?? 0));
  } catch (e) {
    console.error("[sync] could not read archive staleness; using factory order:", e);
  }
  const queue = [...state.ids].sort(
    (a, b) => (staleness.get(a) ?? 0) - (staleness.get(b) ?? 0),
  );

  const deadline = Date.now() + CRON_BUDGET_MS;
  const archived: Record<string, number> = {};
  let skipped = 0;

  for (const each of queue) {
    // Checked before starting rather than after: an archive sweep can take most
    // of a minute, so beginning one with five seconds left just gets it killed
    // halfway. It carries on from `activitySweptTo` on the next run either way.
    if (Date.now() > deadline) {
      skipped += 1;
      continue;
    }
    const result = await archiveActivity(db, each, state.syncedAt);
    archived[each] = result.written;
  }

  // Said out loud, because a run that quietly stopped early looks exactly like a
  // run that had nothing to do.
  if (skipped > 0) console.warn(`[sync] out of time with ${skipped} events unarchived`);

  return NextResponse.json({
    indexed: state.indexed,
    unreadable: state.unreadable,
    syncedLedger: state.ledger,
    archived,
    skipped,
  });
}

/**
 * Mirror event state into the index — the original job of this route, lifted out
 * so both the on-demand POST and the scheduled GET run exactly the same one.
 */
async function indexState(db: Firestore, id?: string) {
  let ids: string[];
  let truncated = false;
  try {
    if (id) {
      // Only index events this factory actually made. Without this check the
      // endpoint would happily mirror any contract on the network into a
      // collection the app treats as its own event list.
      const known = await listEventIds();
      if (!known.includes(id)) {
        return {
          failed: NextResponse.json(
            { error: "not an event from this factory" },
            { status: 404 },
          ),
        };
      }
      ids = [id];
    } else {
      ids = await listEventIds();
      if (ids.length > MAX_EVENTS_PER_SWEEP) {
        ids = ids.slice(-MAX_EVENTS_PER_SWEEP);
        truncated = true;
      }
    }
  } catch (e) {
    console.error("[sync] could not list events from the factory:", e);
    return {
      failed: NextResponse.json({ error: "could not reach the network" }, { status: 502 }),
    };
  }

  const ledger = await server
    .getLatestLedger()
    .then((l) => l.sequence)
    .catch(() => 0);
  const syncedAt = Date.now();

  // allSettled, not all: an event whose state has archived must not stop the
  // other ninety-nine from being indexed. That failure mode is precisely what
  // this index exists to soften.
  const results = await Promise.allSettled(ids.map((each) => loadEvent(each)));

  const batch = db.batch();
  let indexed = 0;
  const unreadable: string[] = [];

  results.forEach((result, i) => {
    if (result.status === "rejected") {
      // Leave whatever the index already holds. A stale record of an event that
      // exists beats no record of it at all.
      unreadable.push(ids[i]);
      return;
    }
    const e = result.value;
    const record: IndexedEvent = {
      id: e.id,
      title: e.title,
      startsAt: e.startsAt,
      factory: FACTORY_ID,
      organizer: e.organizer,
      deposit: e.deposit.toString(),
      feeAllowance: e.feeAllowance.toString(),
      capacity: e.capacity,
      policy: e.policy.tag,
      reserved: e.reserved,
      checkedIn: e.checkedIn,
      phase: e.phase,
      reputation: null,
      syncedAt,
      syncedLedger: ledger,
    };
    // Merged rather than replaced: the activity archive's own bookkeeping lives
    // on this document, and a whole-document write from a factory-wide sweep
    // would silently reset it to "never archived" on every pass.
    batch.set(db.collection(EVENTS_COLLECTION).doc(e.id), record, { merge: true });
    indexed += 1;
  });

  if (indexed > 0) await batch.commit();

  return { ids, indexed, unreadable, truncated, ledger, syncedAt };
}

/**
 * Copy one event's contract events into the archive, as far back as the RPC
 * still goes.
 *
 * Idempotent by construction: every row is written under `activityId`, so
 * sweeping a range twice rewrites the same documents. That is what lets this be
 * called on every page view and after every action without any coordination —
 * and what lets a sweep that ran out of time simply be called again.
 */
async function archiveActivity(db: Firestore, id: string, syncedAt: number) {
  const ref = db.collection(EVENTS_COLLECTION).doc(id);

  let wasComplete = false;
  let sweptTo = 0;
  try {
    const prior = await ref.get();
    wasComplete = prior.get("activityComplete") === true;
    sweptTo = Number(prior.get("activitySweptTo") ?? 0);
  } catch (e) {
    console.error("[sync] could not read archive progress, sweeping from the start:", e);
  }

  // Until the `event_created` row has been seen, there may be history below what
  // the archive holds, so keep reaching for the bottom of the RPC's range. After
  // that a sweep only has to cover what has happened since the last one.
  const from =
    wasComplete && sweptTo > 0 ? Math.max(1, sweptTo - ARCHIVE_OVERLAP_LEDGERS) : undefined;

  let swept;
  try {
    swept = await sweepEventActivity(id, FACTORY_ID, {
      from,
      deadline: Date.now() + ARCHIVE_BUDGET_MS,
    });
  } catch (e) {
    // The state index above is already written and is the more important half.
    console.error("[sync] could not sweep activity:", e);
    return { written: 0, complete: wasComplete, error: "sweep-failed" };
  }

  const rows = swept.activity;
  for (let i = 0; i < rows.length; i += MAX_BATCH_WRITES) {
    const batch = db.batch();
    for (const row of rows.slice(i, i + MAX_BATCH_WRITES)) {
      batch.set(ref.collection(ACTIVITY_COLLECTION).doc(activityId(row)), toArchived(row));
    }
    await batch.commit();
  }

  const complete = wasComplete || reachesCreation(rows);
  await ref.set(
    { activitySweptTo: swept.sweptTo, activityComplete: complete, activitySyncedAt: syncedAt },
    { merge: true },
  );

  return {
    written: rows.length,
    complete,
    sweptFrom: swept.sweptFrom,
    sweptTo: swept.sweptTo,
    // The sweep stopped early — call again to carry on from `sweptTo`.
    truncated: swept.truncated,
  };
}
