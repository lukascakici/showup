import { doc, getDoc } from "firebase/firestore";
import { firestore } from "./firebase";
import { EMPTY_RECORD, type Record } from "./record";

/**
 * A wallet's show-up record, as mirrored into Firestore.
 *
 * **The chain decides, this remembers.** Every number here was read off the
 * reputation contract by `/api/records/sync` and can be thrown away and
 * re-derived at any time — which is the property that lets it be written without
 * asking who is calling, and the reason it is not something a reputation's owner
 * could edit.
 *
 * Why it exists: a record is a *backward-looking* thing. `get_record` is one RPC
 * round trip per wallet, and a guest list of twelve is twelve of them, on a page
 * that polls. Reading history off the chain on every view is the wrong shape —
 * the chain is where it is decided, not where it is served from. So the same
 * split the event index already uses applies here: anything that decides money
 * or admission is read from the contract at the moment it decides; anything that
 * is being *shown* comes from here, with the time it was read attached.
 */
export type IndexedRecord = Record & {
  /** The wallet, and the document id. */
  address: string;
  /** ms since epoch, so a page can say how old this is and mean it. */
  syncedAt: number;
  /** Which ledger the read saw, for a reviewer checking it against the chain. */
  syncedLedger: number;
};

export const RECORDS_COLLECTION = "records";

/** How long a mirrored record is served before the chain is asked again. */
export const RECORD_TTL_MS = 60_000;

export function isStale(record: IndexedRecord | null, now = Date.now()): boolean {
  return record === null || now - record.syncedAt > RECORD_TTL_MS;
}

/** Just the counters, for code that does not care when they were read. */
export function toRecord(doc: IndexedRecord): Record {
  return {
    shows: doc.shows,
    noShows: doc.noShows,
    vouchesGiven: doc.vouchesGiven,
    vouchesBroken: doc.vouchesBroken,
    eventsOrganised: doc.eventsOrganised,
  };
}

/**
 * One mirrored record, or `null` when the index is off or has never seen it.
 *
 * Note what `null` does **not** mean: it is not "this wallet has no record". An
 * unmirrored wallet and a wallet the ledger has never heard of look identical
 * here, and only the chain can tell them apart — so a caller that needs to say
 * "never seen" has to ask the contract, not this.
 */
export async function readIndexedRecord(address: string): Promise<IndexedRecord | null> {
  const db = firestore();
  if (!db) return null;

  const snapshot = await getDoc(doc(db, RECORDS_COLLECTION, address));
  if (!snapshot.exists()) return null;
  // Spread over the defaults: a document written before a counter existed is
  // still a good snapshot of the counters that did, and reading `undefined` into
  // a number would render as NaN on the page.
  return { ...EMPTY_RECORD, ...(snapshot.data() as IndexedRecord) };
}

/**
 * Ask the server to re-read one wallet's record off the chain and mirror it.
 *
 * Fire-and-forget, like `requestSync`. A failed refresh means the page is showing
 * a slightly older snapshot with an accurate "as of" line on it, which is a
 * cosmetic problem; surfacing it would train people to ignore a warning that
 * never matters.
 */
export async function requestRecordSync(address: string | string[]): Promise<void> {
  try {
    await fetch("/api/records/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Array.isArray(address) ? { addresses: address } : { address }),
    });
  } catch {
    // Deliberately silent — see above.
  }
}

/**
 * A record for showing on screen: the mirror, refreshed from the chain when it
 * has gone stale.
 *
 * This is the read every *display* of a record goes through, and the chain read
 * every *decision* does not. Showing somebody their own check-in count against a
 * threshold is a display — the contract still checks the real number inside
 * `rsvp`, and it is the only opinion that moves money. So this can be a Firestore
 * read on a poll instead of an RPC round trip on a poll, which is the difference
 * between a page that costs nothing to leave open and one that does not.
 *
 * Falls through to the contract when there is no mirror at all, because a wallet
 * nobody has ever synced would otherwise read as a wallet with no record, and
 * those are opposite claims.
 */
export async function loadRecordForDisplay(address: string): Promise<Record> {
  const mirrored = await readIndexedRecord(address).catch(() => null);

  if (mirrored && !isStale(mirrored)) return toRecord(mirrored);

  // Not awaited when there is something to show: the refresh lands in the mirror
  // and the next tick of the caller's poll picks it up, so nobody waits on RPC to
  // see a number that was already read.
  if (mirrored) {
    void requestRecordSync(address);
    return toRecord(mirrored);
  }

  const { loadRecord } = await import("./record");
  const fresh = await loadRecord(address);
  void requestRecordSync(address);
  return fresh;
}
