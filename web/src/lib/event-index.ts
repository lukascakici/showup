import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { firestore } from "./firebase";
import { FACTORY_ID } from "./contracts";
import type { EventState } from "./chain";

/**
 * One event, as mirrored into Firestore.
 *
 * This is a **derived** record, never an authority. Every field is copied from
 * the chain by `/api/events/sync` and can be re-derived at any time by deleting
 * the document and syncing again — which is the property that lets the index be
 * written without asking who is calling.
 *
 * What it is for: the event list keeps working when a Soroban RPC read fails or
 * an event's state has archived, instead of a single bad read emptying the whole
 * page. Anything that decides money is still read from the contract when the
 * event is opened.
 *
 * `deposit` and `feeAllowance` are strings because Firestore has no bigint and
 * silently truncating stroops into a float is exactly the kind of quiet
 * corruption a deposit must never suffer.
 */
export type IndexedEvent = {
  id: string;
  title: string;
  startsAt: number;
  /** Which factory deployed it, so a migration is visible instead of confusing. */
  factory: string;
  organizer: string;
  /**
   * Everyone who may run the event. Optional because documents written before
   * co-hosting existed have no such field, and they are still perfectly good
   * snapshots of events that genuinely had one host.
   */
  hosts?: string[];
  deposit: string;
  feeAllowance: string;
  capacity: number;
  policy: EventState["policy"]["tag"];
  reserved: string[];
  checkedIn: string[];
  phase: EventState["phase"];
  reputation: string | null;
  /** ms since epoch, so the UI can say how old this snapshot is and mean it. */
  syncedAt: number;
  syncedLedger: number;

  /**
   * How far the activity archive has been swept, and whether it reaches back to
   * the event's creation. Absent until the event has been synced by id at least
   * once — a sweep of the whole factory indexes state only, because paging every
   * event's full history in one request is minutes of RPC calls.
   *
   * `activityComplete` is what turns the next sweep incremental: until the
   * `event_created` row has been seen there may be history below what the
   * archive holds, so every sync goes back as far as the RPC will allow.
   */
  activitySweptTo?: number;
  activityComplete?: boolean;
  activitySyncedAt?: number;

  /**
   * The one field here that is **not** derived from the chain.
   *
   * Set by hand to take the event out of the home page's list; see `./listing`
   * for what that does and does not mean. The sync route writes this document
   * with `{ merge: true }` and names every field it sets, so this one is never
   * touched by a re-sync.
   */
  hidden?: boolean;
};

export const EVENTS_COLLECTION = "events";

export function toEventState(doc: IndexedEvent): EventState {
  return {
    id: doc.id,
    title: doc.title,
    startsAt: doc.startsAt,
    organizer: doc.organizer,
    hosts: doc.hosts ?? [doc.organizer],
    deposit: BigInt(doc.deposit),
    feeAllowance: BigInt(doc.feeAllowance),
    capacity: doc.capacity,
    policy: { tag: doc.policy, values: undefined } as EventState["policy"],
    reserved: doc.reserved,
    checkedIn: doc.checkedIn,
    phase: doc.phase,
  };
}

/**
 * Every indexed event for the factory the app is currently pointed at.
 *
 * Filtered by factory rather than returning the whole collection: after a
 * migration the old factory's events are still in Firestore and still real, but
 * showing them next to the current ones would offer people a list of events the
 * app can no longer create siblings for. Empty array when the index is off.
 */
export async function readIndexedEvents(): Promise<IndexedEvent[]> {
  const db = firestore();
  if (!db) return [];

  const snapshot = await getDocs(
    query(collection(db, EVENTS_COLLECTION), where("factory", "==", FACTORY_ID)),
  );
  return snapshot.docs.map((d) => d.data() as IndexedEvent);
}

/** How long a fetched index is reused before Firestore is asked again. */
export const INDEX_TTL_MS = 60_000;

let cached: { at: number; docs: IndexedEvent[] } | null = null;

/** Drop the cache. For tests, and anywhere a fresh read is worth the trip. */
export function forgetIndexCache() {
  cached = null;
}

/**
 * `readIndexedEvents`, at most once a minute.
 *
 * The home page polls every ten seconds and now needs this on the happy path
 * too — not as a fallback, but because the `hidden` flags live here. Querying
 * the collection on every tick would be a Firestore bill for an answer that
 * changes by hand perhaps twice a month. A minute of staleness costs an event
 * staying visible for another minute after somebody hid it.
 *
 * A failure is not cached: an outage should be retried on the next tick, not
 * remembered as "the index is empty" for the following minute.
 */
export async function readIndexedEventsCached(now = Date.now()): Promise<IndexedEvent[]> {
  if (cached && now - cached.at < INDEX_TTL_MS) return cached.docs;
  const docs = await readIndexedEvents().catch(() => null);
  if (docs === null) return cached?.docs ?? [];
  cached = { at: now, docs };
  return docs;
}

/** A single indexed event, or `null` when the index is off or has never seen it. */
export async function readIndexedEvent(id: string): Promise<IndexedEvent | null> {
  const db = firestore();
  if (!db) return null;

  const snapshot = await getDoc(doc(db, EVENTS_COLLECTION, id));
  return snapshot.exists() ? (snapshot.data() as IndexedEvent) : null;
}

/**
 * Ask the server to re-read the chain and refresh the index.
 *
 * Fire-and-forget on purpose. A failed sync means the index is a little stale,
 * which is a cosmetic problem; surfacing it would train people to ignore a
 * warning that never matters. The chain read the caller just did is unaffected
 * either way.
 */
export async function requestSync(id?: string): Promise<void> {
  try {
    await fetch("/api/events/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(id ? { id } : {}),
    });
  } catch {
    // Deliberately silent — see above.
  }
}
