import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase-admin";
import { server } from "@/lib/chain";
import { isAccountAddress, loadRecord } from "@/lib/record";
import { RECORDS_COLLECTION, type IndexedRecord } from "@/lib/record-index";

/**
 * Read wallets' show-up records off the chain and mirror them into Firestore.
 *
 * **This endpoint accepts no data**, in the same sense `/api/events/sync` accepts
 * none: it takes addresses saying *whose* record to refresh, then reads every
 * number from the reputation contract itself and writes what it read. A caller
 * cannot set a score, so there is nothing to gain by calling it dishonestly and
 * nothing to protect with a login.
 *
 * That is what keeps the mirror honest. A reputation somebody could edit is not a
 * reputation, and the guarantee here is structural rather than a permission
 * check: there is no code path from a request body to a stored number.
 *
 * Why mirror at all, when the contract is right there: a record is backward
 * looking. `get_record` is one RPC round trip per wallet, and the pages that want
 * these numbers want twelve of them at once and poll. The chain stays the place a
 * record is *decided* — every admission check, every vouch, every settlement
 * reads the contract at the moment it matters. This is the place it is *shown*,
 * and every page that shows it also says when it was read.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Most requests carry one address; an event page carries its guest list.
 *
 * Capped because the work is one RPC read each and the cap is what stops a single
 * request from being a way to spend our rate limit. Well above any real event:
 * the largest run so far had twelve guests.
 */
const MAX_ADDRESSES = 60;

export async function POST(request: Request) {
  const db = adminFirestore();
  if (!db) {
    // Not an error the caller did anything about, and not fatal: every page that
    // reads a record can still ask the chain directly.
    return NextResponse.json({ synced: 0, reason: "index-not-configured" }, { status: 200 });
  }

  let asked: unknown;
  try {
    const body = (await request.json()) as { address?: unknown; addresses?: unknown };
    asked = body.addresses ?? body.address;
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const addresses = [...new Set((Array.isArray(asked) ? asked : [asked]).filter(isAddress))];
  if (addresses.length === 0) {
    return NextResponse.json({ error: "no wallet address given" }, { status: 400 });
  }
  if (addresses.length > MAX_ADDRESSES) {
    return NextResponse.json(
      { error: `at most ${MAX_ADDRESSES} addresses per request` },
      { status: 400 },
    );
  }

  // One ledger number for the whole batch, read alongside rather than after: it
  // is what a reviewer uses to check a mirrored number against the chain, and
  // "roughly now" is the honest precision for it.
  const [ledger, results] = await Promise.all([
    server
      .getLatestLedger()
      .then((l: { sequence: number }) => l.sequence)
      .catch(() => 0),
    Promise.allSettled(addresses.map((address) => loadRecord(address))),
  ]);

  const syncedAt = Date.now();
  const batch = db.batch();
  const unreadable: string[] = [];
  let synced = 0;

  results.forEach((result, i) => {
    if (result.status === "rejected") {
      // Leave whatever the mirror already holds. A record read last hour beats no
      // record at all, and the page says which it is showing.
      unreadable.push(addresses[i]);
      return;
    }
    const record: IndexedRecord = {
      address: addresses[i],
      ...result.value,
      syncedAt,
      syncedLedger: ledger,
    };
    // Merged rather than replaced, matching the event index: it costs nothing and
    // it means a field added to this document by something else is not silently
    // erased on the next refresh.
    batch.set(db.collection(RECORDS_COLLECTION).doc(addresses[i]), record, { merge: true });
    synced += 1;
  });

  if (synced > 0) await batch.commit();

  return NextResponse.json({ synced, unreadable, syncedLedger: ledger });
}

function isAddress(value: unknown): value is string {
  return typeof value === "string" && isAccountAddress(value);
}
