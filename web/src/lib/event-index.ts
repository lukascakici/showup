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
};

export const EVENTS_COLLECTION = "events";

export function toEventState(doc: IndexedEvent): EventState {
  return {
    id: doc.id,
    title: doc.title,
    startsAt: doc.startsAt,
    organizer: doc.organizer,
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
