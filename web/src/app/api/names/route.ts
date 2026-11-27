import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";
import { isAccountAddress } from "@/lib/record";
import { NAMES_COLLECTION, nameProblem, NAME_PROBLEMS } from "@/lib/names";
import { PROFILE_PROBLEMS, evmProblem, normalizeHandle, xProblem } from "@/lib/profile";
import { issueChallenge, spendChallenge } from "@/lib/wallet-proof";

/**
 * Claim a display name for a wallet, by proving you hold it.
 *
 * **The only thing in this app a person authors**, which makes it the only thing
 * that needs a real answer to "who is asking". Every other route re-derives what it
 * writes from a contract and is therefore safe to leave open; a name cannot be
 * derived from anything, so a name claimed for somebody else's wallet is the whole
 * risk — and not a small one, because a name sits next to an attendance record and
 * in an organizer's approval queue and the point of it is that a reader trusts it.
 *
 * The proof itself lives in `lib/wallet-proof.ts`, shared with the event
 * conversation. Signature verification is the last code that should exist twice.
 *
 * `GET` issues a challenge transaction; `POST` spends it and writes the name.
 * Nothing is ever submitted to the chain.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PURPOSE = "name";

export async function GET(request: Request) {
  const db = adminFirestore();
  if (!db) return NextResponse.json({ error: "names are not configured" }, { status: 503 });

  const address = new URL(request.url).searchParams.get("address") ?? "";
  if (!isAccountAddress(address)) {
    return NextResponse.json({ error: "not a wallet address" }, { status: 400 });
  }

  return NextResponse.json(await issueChallenge(db, address, PURPOSE));
}

export async function POST(request: Request) {
  const db = adminFirestore();
  if (!db) return NextResponse.json({ error: "names are not configured" }, { status: 503 });

  let body: {
    address?: unknown;
    name?: unknown;
    nonce?: unknown;
    signedXdr?: unknown;
    x?: unknown;
    evm?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const { address, name, nonce, signedXdr, x, evm } = body;
  if (typeof address !== "string" || !isAccountAddress(address)) {
    return NextResponse.json({ error: "not a wallet address" }, { status: 400 });
  }
  if (typeof nonce !== "string" || typeof signedXdr !== "string") {
    return NextResponse.json({ error: "missing proof" }, { status: 400 });
  }

  // A blank name is how somebody goes back to being an address, which has to stay
  // possible: a name is optional, and "optional" that cannot be undone is not.
  const clearing = name === "" || name === null;
  if (!clearing) {
    if (typeof name !== "string") {
      return NextResponse.json({ error: "name must be text" }, { status: 400 });
    }
    // Checked before the proof is spent, so a corrected name can be retried on the
    // same signature rather than costing another wallet prompt.
    const problem = nameProblem(name);
    if (problem) {
      return NextResponse.json({ error: NAME_PROBLEMS[problem], problem }, { status: 400 });
    }
  }

  // The two optional links, validated on the same pass and before the same
  // proof. Absent means "leave whatever is there"; an empty string means
  // "remove it" — the same distinction the name itself draws, so that clearing
  // one field is possible without touching the other.
  const wantsX = typeof x === "string";
  const wantsEvm = typeof evm === "string";
  if (x !== undefined && !wantsX) {
    return NextResponse.json({ error: "x must be text" }, { status: 400 });
  }
  if (evm !== undefined && !wantsEvm) {
    return NextResponse.json({ error: "evm must be text" }, { status: 400 });
  }
  const linkProblem = (wantsX ? xProblem(x) : null) ?? (wantsEvm ? evmProblem(evm) : null);
  if (linkProblem) {
    return NextResponse.json(
      { error: PROFILE_PROBLEMS[linkProblem], problem: linkProblem },
      { status: 400 },
    );
  }

  const proved = await spendChallenge(db, { address, nonce, signedXdr, purpose: PURPOSE });
  if (!proved) {
    return NextResponse.json({ error: "that signature isn't from this wallet" }, { status: 401 });
  }

  const ref = db.collection(NAMES_COLLECTION).doc(address);

  // Clearing the *name* removes the document, links and all. That is the one
  // reading that matches what the button says — "go back to being an address" —
  // and leaving orphaned links behind a wallet with no name would be a profile
  // nobody asked to keep.
  if (clearing) {
    await ref.delete();
    return NextResponse.json({ name: null, x: null, evm: null });
  }

  const handle = wantsX ? normalizeHandle(x) : undefined;
  const chain = wantsEvm ? evm.trim() : undefined;

  // `merge: true` with `FieldValue.delete()` for the empty cases, so editing one
  // field never silently drops the other.
  await ref.set(
    {
      address,
      name,
      claimedAt: Date.now(),
      ...(wantsX ? { x: handle ? handle : FieldValue.delete() } : {}),
      ...(wantsEvm ? { evm: chain ? chain : FieldValue.delete() } : {}),
    },
    { merge: true },
  );

  return NextResponse.json({ name, x: handle ?? null, evm: chain ?? null });
}
