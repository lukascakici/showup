import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase-admin";
import { FACTORY_ID } from "@/lib/contracts";
import { listEventIds, loadEvent, server } from "@/lib/chain";
import { EVENTS_COLLECTION, type IndexedEvent } from "@/lib/event-index";

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

/** Cap a full sweep so one call cannot run unbounded as the factory grows. */
const MAX_EVENTS_PER_SWEEP = 100;

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

  let ids: string[];
  let truncated = false;
  try {
    if (id) {
      // Only index events this factory actually made. Without this check the
      // endpoint would happily mirror any contract on the network into a
      // collection the app treats as its own event list.
      const known = await listEventIds();
      if (!known.includes(id)) {
        return NextResponse.json({ error: "not an event from this factory" }, { status: 404 });
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
    return NextResponse.json({ error: "could not reach the network" }, { status: 502 });
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
    batch.set(db.collection(EVENTS_COLLECTION).doc(e.id), record);
    indexed += 1;
  });

  if (indexed > 0) await batch.commit();

  return NextResponse.json({ indexed, unreadable, truncated, syncedLedger: ledger });
}
