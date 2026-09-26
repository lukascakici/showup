import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase-admin";
import { loadEvent } from "@/lib/chain";
import { readSession, sessionSecret } from "@/lib/wallet-proof";
import { MESSAGE_MAX_LENGTH, messageProblem, MESSAGE_PROBLEMS } from "@/lib/messages";

/**
 * The conversation for one event, open to the people holding a spot in it.
 *
 * ## Why this is a route and not a Firestore rule
 *
 * The plan for this said "with Firestore rules enforcing it rather than the
 * interface hiding it", and the shape below is that requirement met a different
 * way — because the obvious way is weaker here, not stronger.
 *
 * A Firestore rule can only reason about what is in Firestore. To gate on
 * membership it would have to read the *mirrored* event document, which is a
 * snapshot: a guest list that was true when the last sync ran. The authority on who
 * is holding a spot is the event contract, and no rule can read a contract. So a
 * rule-based version would enforce the right idea against the wrong source, and
 * "the reserved list was stale" is not a thing to discover in a group chat.
 *
 * This reads `get_reserved`, `get_checked_in` and the host list **off the chain, on
 * every request**. Clients are denied both reads and writes in `firestore.rules`,
 * so there is no path to these documents that does not come through here.
 *
 * ## Who may take part
 *
 * Anyone the contract lists as reserved or checked in, plus any host. Deliberately
 * not applicants: somebody who has asked to come has had nothing taken from them
 * and has not been let in, and a conversation is one of the things they are asking
 * for. Deliberately still open after `finalize`, because the people who were there
 * are the people most likely to have something to say afterwards.
 *
 * Moderation is a host deleting a message on their own event, and nothing else. No
 * direct messages, no global moderation, no reporting queue — the whole surface is
 * one event's guest list, and the organizer who invited them is the right and only
 * authority over it.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "messages";

/** Enough to read on a phone without paging, newest last. */
const PAGE = 200;

type Member = { address: string; isHost: boolean };

/**
 * Who this request is, and whether the contract says they belong here.
 *
 * Returns a `NextResponse` on every refusal so the callers stay linear. The
 * distinction between 401 and 403 is kept honest: 401 is "we don't know who you
 * are", 403 is "we do, and the contract says you aren't in this event".
 */
async function member(request: Request, id: string): Promise<Member | NextResponse> {
  const secret = sessionSecret();
  if (!secret) {
    return NextResponse.json({ error: "the conversation is not configured" }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const address = readSession(token, secret);
  if (!address) {
    return NextResponse.json({ error: "sign in to read this conversation" }, { status: 401 });
  }

  let event;
  try {
    event = await loadEvent(id);
  } catch {
    // Not a soft failure. Falling back to the mirrored guest list would be
    // deciding who may speak from a snapshot, which is the exact thing this route
    // exists to avoid.
    return NextResponse.json({ error: "couldn't check the guest list just now" }, { status: 503 });
  }

  const isHost = event.hosts.includes(address);
  const holdsASpot = event.reserved.includes(address) || event.checkedIn.includes(address);
  if (!isHost && !holdsASpot) {
    return NextResponse.json(
      { error: "this conversation is for the people holding a spot" },
      { status: 403 },
    );
  }

  return { address, isHost };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = adminFirestore();
  if (!db) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const { id } = await params;
  const who = await member(request, id);
  if (who instanceof NextResponse) return who;

  const snapshot = await db
    .collection("events")
    .doc(id)
    .collection(COLLECTION)
    .orderBy("at", "desc")
    .limit(PAGE)
    .get();

  const messages = snapshot.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as { from: string; body: string; at: number }) }))
    .reverse();

  return NextResponse.json({ messages, you: who.address, isHost: who.isHost });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = adminFirestore();
  if (!db) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const { id } = await params;

  let body: { body?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body : "";
  const problem = messageProblem(text);
  if (problem) {
    return NextResponse.json({ error: MESSAGE_PROBLEMS[problem], problem }, { status: 400 });
  }

  const who = await member(request, id);
  if (who instanceof NextResponse) return who;

  const ref = await db
    .collection("events")
    .doc(id)
    .collection(COLLECTION)
    .add({
      // From the session, never from the body. A `from` a caller could set is a
      // conversation where anybody can be anybody.
      from: who.address,
      body: text.trim().slice(0, MESSAGE_MAX_LENGTH),
      at: Date.now(),
    });

  return NextResponse.json({ id: ref.id });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = adminFirestore();
  if (!db) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const { id } = await params;
  const messageId = new URL(request.url).searchParams.get("message") ?? "";
  if (!messageId) return NextResponse.json({ error: "which message?" }, { status: 400 });

  const who = await member(request, id);
  if (who instanceof NextResponse) return who;

  const ref = db.collection("events").doc(id).collection(COLLECTION).doc(messageId);
  const existing = await ref.get();
  if (!existing.exists) return NextResponse.json({ deleted: false });

  // A host may remove anything on their own event; anybody else may remove only
  // their own. Checked against the stored `from`, which only this route ever wrote.
  const own = existing.get("from") === who.address;
  if (!who.isHost && !own) {
    return NextResponse.json({ error: "that isn't yours to delete" }, { status: 403 });
  }

  await ref.delete();
  return NextResponse.json({ deleted: true });
}
