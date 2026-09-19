import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase-admin";
import {
  HERE_SUBCOLLECTION,
  ROLL_CALL_COLLECTION,
  isOpen,
  newestFirst,
  readAddress,
  rollCallBySlug,
  type Entry,
} from "@/lib/roll-call";

/**
 * The roll call: who said they were in the room.
 *
 * `firestore.rules` grants clients nothing, so this route is the only way in or
 * out of the collection, the same shape as `/api/events/sync` and for the same
 * reason: a Firebase web config ships inside the browser bundle, so a client
 * write path is a write path for everyone on the internet.
 *
 * Unlike that route, this one *does* accept data: an address it cannot verify.
 * See `lib/roll-call.ts` for why that trade is acceptable here and nowhere near
 * anything graded. The guards that remain are the ones worth having: the slug
 * must be a roll call this build knows about, the address must be a well-formed
 * Stellar public key, and the door must be open. A link that escapes the room
 * stops working the day after.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unavailable() {
  // The same degradation the index uses: no key on the server is a deployment
  // state, not the visitor's problem, and it should read as "not working yet"
  // rather than as a crash.
  return NextResponse.json({ error: "roll-call-not-configured" }, { status: 503 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const call = rollCallBySlug(slug);
  if (!call) return NextResponse.json({ error: "no such roll call" }, { status: 404 });

  const db = adminFirestore();
  if (!db) return unavailable();

  const snapshot = await db
    .collection(ROLL_CALL_COLLECTION)
    .doc(slug)
    .collection(HERE_SUBCOLLECTION)
    .get();

  const entries: Entry[] = snapshot.docs.map((doc) => ({
    address: doc.id,
    at: Number(doc.get("at")) || 0,
  }));

  return NextResponse.json({ open: isOpen(call, Date.now() / 1000), entries: newestFirst(entries) });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const call = rollCallBySlug(slug);
  if (!call) return NextResponse.json({ error: "no such roll call" }, { status: 404 });

  if (!isOpen(call, Date.now() / 1000)) {
    return NextResponse.json({ error: "this roll call is closed" }, { status: 409 });
  }

  const address = readAddress(await request.json().catch(() => null));
  if (!address) {
    return NextResponse.json({ error: "that is not a Stellar address" }, { status: 400 });
  }

  const db = adminFirestore();
  if (!db) return unavailable();

  const entry = db
    .collection(ROLL_CALL_COLLECTION)
    .doc(slug)
    .collection(HERE_SUBCOLLECTION)
    .doc(address);

  // Keyed by address and written with `create`, so arriving twice is one entry
  // and the second attempt cannot quietly rewrite the first one's arrival time.
  // A wallet that taps the button again gets the same friendly answer as the
  // first tap rather than an error it did nothing to deserve.
  const already = (await entry.get()).exists;
  if (!already) await entry.set({ at: Date.now() });

  return NextResponse.json({ ok: true, address, already });
}
