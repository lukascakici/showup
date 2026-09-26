import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase-admin";
import { isFunnelStep } from "@/lib/funnel";
import { isAccountAddress } from "@/lib/record";

/**
 * Record one step of the invitation-to-attendance funnel.
 *
 * **The only endpoint here that stores something the chain does not know.** Every
 * other route re-derives what it writes from a contract, which is what makes them
 * safe to leave open. This one cannot: "somebody opened an invite and never
 * connected a wallet" happens entirely in a browser and leaves no trace anywhere
 * else, and it is the most important number in the whole report.
 *
 * So the protection is a narrow shape rather than a re-derivation. Four things are
 * accepted and nothing else:
 *
 * - `step`, which must be one of four literals
 * - `session`, a random id the browser invented, length-capped
 * - `eventId`, which must look like a contract address
 * - `address`, which must look like a Stellar account
 *
 * Anything else in the body is dropped before it reaches Firestore, so there is no
 * way to use this as free storage or to write a field that some other page reads.
 * The timestamp is the server's, never the caller's.
 *
 * **Reads are denied to clients** in `firestore.rules`, unlike every other
 * collection. The rest of the database is a copy of a public ledger; this is
 * visitor behaviour, and the fact that it is pseudonymous is not a reason to serve
 * it to anybody who asks.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Long enough for a UUID and short enough that this is not a storage service. */
const MAX_SESSION_LENGTH = 64;

export async function POST(request: Request) {
  const db = adminFirestore();
  if (!db) {
    // Measurement is never a reason to fail a request. The visitor's reservation
    // works exactly the same whether this is configured or not.
    return NextResponse.json({ recorded: false, reason: "not-configured" }, { status: 200 });
  }

  let body: { step?: unknown; session?: unknown; eventId?: unknown; address?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  if (!isFunnelStep(body.step)) {
    return NextResponse.json({ error: "unknown step" }, { status: 400 });
  }
  if (
    typeof body.session !== "string" ||
    body.session.length === 0 ||
    body.session.length > MAX_SESSION_LENGTH
  ) {
    return NextResponse.json({ error: "bad session" }, { status: 400 });
  }

  const eventId =
    typeof body.eventId === "string" && /^C[A-Z2-7]{55}$/.test(body.eventId) ? body.eventId : null;
  const address =
    typeof body.address === "string" && isAccountAddress(body.address) ? body.address : null;

  /**
   * Deterministic, so a refresh is not a second visitor.
   *
   * `invite_opened` fires on mount, and a guest who reloads the page while
   * deciding would otherwise be counted again — inflating the top of the funnel
   * and making the deposit look worse at exactly the step it is meant to fix. One
   * row per session per event per step, rewritten rather than duplicated. The same
   * trick the activity archive uses for contract events.
   */
  const id = [body.step, body.session, eventId ?? "no-event"].join("__");

  /**
   * A field that is absent is left out, not written as `null`.
   *
   * `{ merge: true }` only leaves a stored field alone when the object does not
   * mention it. Sending `address: null` is an instruction to erase, so a row that
   * already knew a wallet would lose it the next time the same step arrived
   * without one — which is a merge that does the opposite of merging. Caught by
   * reading the documents back rather than by trusting the word.
   */
  const row: Record<string, string | number> = {
    step: body.step,
    session: body.session,
    // The server's clock. A caller-supplied time would let the order of the steps
    // be rewritten, and the order is the whole measurement.
    at: Date.now(),
  };
  if (eventId) row.eventId = eventId;
  if (address) row.address = address;

  await db.collection("funnel").doc(id).set(row, { merge: true });

  return NextResponse.json({ recorded: true });
}
