import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { firestore } from "./firebase";
import { EVENTS_COLLECTION } from "./event-index";
import { activityId, type Activity } from "./chain";

/**
 * The activity feed, kept after the chain stops answering for it.
 *
 * Soroban RPC retains roughly a week of ledgers and then drops them. Contract
 * *state* survives that — who reserved, who showed — but contract *events* do
 * not, and the events are where the transaction hashes live. So an event page
 * older than a week showed a complete set of numbers above a feed that said
 * "Nothing yet.", and the hashes a reviewer is asked to check were gone from the
 * product that produced them.
 *
 * This is the same bargain as `event-index.ts`, one level down. Every row is
 * **derived**: copied from the chain by `/api/events/sync` while the chain still
 * had it, and identified by `activityId` so re-reading the same ledger range
 * rewrites rows rather than duplicating them. Nothing here is an authority —
 * the live feed wins on every row it can still see, and the money is read from
 * the contract, never from here.
 *
 * `refunded` and `forfeited` are strings for the same reason deposits are in
 * `IndexedEvent`: Firestore has no bigint, and a stroop count quietly rounded
 * into a float is the one kind of wrong a payout must never be.
 */
export const ACTIVITY_COLLECTION = "activity";

/** How many rows one event's archive can hold. Far above any real event. */
export const ACTIVITY_LIMIT = 500;

export type ArchivedActivity = {
  kind: Activity["kind"];
  ledger: number;
  txHash: string;
  at: number;
  organizer?: string;
  title?: string;
  phase?: string;
  guest?: string;
  spotsLeft?: number;
  refunded?: string;
  showed?: number;
  noShows?: number;
  forfeited?: string;
};

/**
 * A row, flattened for storage.
 *
 * Only the fields that kind actually has: Firestore rejects `undefined` outright
 * rather than storing a null, so a record built by spreading the union would
 * fail on whichever variant it happened to be handed.
 */
export function toArchived(a: Activity): ArchivedActivity {
  const base = { kind: a.kind, ledger: a.ledger, txHash: a.txHash, at: a.at };
  switch (a.kind) {
    case "created":
      return { ...base, organizer: a.organizer, title: a.title };
    case "phase_changed":
      return { ...base, phase: a.phase };
    case "reserved":
      return { ...base, guest: a.guest, spotsLeft: a.spotsLeft };
    case "checked_in":
      return { ...base, guest: a.guest, refunded: a.refunded.toString() };
    case "finalized":
      return {
        ...base,
        showed: a.showed,
        noShows: a.noShows,
        forfeited: a.forfeited.toString(),
      };
  }
}

/** Back into a feed row. `null` for a kind this build doesn't know. */
export function fromArchived(doc: ArchivedActivity): Activity | null {
  const base = { ledger: doc.ledger, txHash: doc.txHash, at: doc.at ?? 0 };
  switch (doc.kind) {
    case "created":
      return { kind: "created", organizer: doc.organizer ?? "", title: doc.title ?? "", ...base };
    case "phase_changed":
      return {
        kind: "phase_changed",
        phase: (doc.phase ?? "Reserving") as Extract<Activity, { kind: "phase_changed" }>["phase"],
        ...base,
      };
    case "reserved":
      return {
        kind: "reserved",
        guest: doc.guest ?? "",
        spotsLeft: doc.spotsLeft ?? 0,
        ...base,
      };
    case "checked_in":
      return {
        kind: "checked_in",
        guest: doc.guest ?? "",
        refunded: BigInt(doc.refunded ?? "0"),
        ...base,
      };
    case "finalized":
      return {
        kind: "finalized",
        showed: doc.showed ?? 0,
        noShows: doc.noShows ?? 0,
        forfeited: BigInt(doc.forfeited ?? "0"),
        ...base,
      };
    default:
      // A row written by a newer deploy than this bundle. Skipping it shows a
      // shorter history; guessing at it would show a wrong one.
      return null;
  }
}

/**
 * One event's archived feed, newest first. Empty when the archive is off or has
 * never seen this event — both of which leave the live feed exactly as it was.
 */
export async function readArchivedActivity(id: string): Promise<Activity[]> {
  const db = firestore();
  if (!db) return [];

  const snapshot = await getDocs(
    query(
      collection(db, EVENTS_COLLECTION, id, ACTIVITY_COLLECTION),
      orderBy("ledger", "desc"),
      limit(ACTIVITY_LIMIT),
    ),
  );
  return snapshot.docs
    .map((d) => fromArchived(d.data() as ArchivedActivity))
    .filter((a): a is Activity => a !== null);
}

/**
 * The live feed on top of the archive, newest first.
 *
 * The two overlap by design — everything from the last day is in both — so the
 * merge is by `activityId` with the chain winning. That ordering matters: the
 * archive is a copy taken at some past moment, and where the two disagree the
 * one that just came off the ledger is the one that is right.
 *
 * Sorted by ledger, descending. Within a ledger the input order is kept, so a
 * `finalize` still reads as its `finalized` row followed by the `phase_changed`
 * it published in the same transaction.
 */
export function mergeActivity(live: Activity[], archived: Activity[]): Activity[] {
  const merged = new Map<string, Activity>();
  for (const a of archived) merged.set(activityId(a), a);
  for (const a of live) merged.set(activityId(a), a);

  // Sorted with an index tiebreak rather than left to Array.sort's stability,
  // which is only guaranteed for the array as given — and this one is rebuilt
  // from a Map whose order is insertion, i.e. archive-first.
  return [...merged.values()]
    .map((a, i) => ({ a, i }))
    .sort((x, y) => y.a.ledger - x.a.ledger || x.i - y.i)
    .map(({ a }) => a);
}

/**
 * Whether a feed reaches all the way back to the event's own creation.
 *
 * The `created` row comes from the factory and is the first thing that ever
 * happened to an event, so its presence is proof that nothing is missing off
 * the bottom — which is the one claim `truncated` exists to avoid making
 * falsely.
 */
export function reachesCreation(activity: Activity[]): boolean {
  return activity.some((a) => a.kind === "created");
}
