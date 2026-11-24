import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase-admin";
import { isAccountAddress } from "@/lib/record";
import { loadEvent } from "@/lib/chain";
import { requestNetwork } from "@/lib/network.server";
import {
  DESCRIPTION_PROBLEMS,
  DESCRIPTION_PURPOSE,
  descriptionProblem,
} from "@/lib/event-description";
import { deleteDescription, writeDescription } from "@/lib/event-description.server";
import { spendChallenge } from "@/lib/wallet-proof";

/**
 * Write or clear an event's description. Hosts only.
 *
 * This is the second thing in the app a person authors, after a display name,
 * and the first that is authored *about something else* — an event somebody else
 * may already have locked a deposit in. So two questions have to be answered
 * before anything is written, and they are different questions:
 *
 * 1. **Who is asking?** A signed challenge transaction, verified in
 *    `wallet-proof.ts` and never submitted.
 * 2. **May they?** The event contract's own host list, read from the chain.
 *
 * Both, in that order of importance and the reverse order of execution — see
 * below for why the chain read comes first.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = adminFirestore();
  if (!db) {
    return NextResponse.json({ error: "descriptions are not configured" }, { status: 503 });
  }

  const { id } = await params;
  if (!/^C[A-Z2-7]{55}$/.test(id)) {
    return NextResponse.json({ error: "not a contract address" }, { status: 400 });
  }

  let payload: { address?: unknown; body?: unknown; nonce?: unknown; signedXdr?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const { address, body, nonce, signedXdr } = payload;
  if (typeof address !== "string" || !isAccountAddress(address)) {
    return NextResponse.json({ error: "not a wallet address" }, { status: 400 });
  }
  if (typeof nonce !== "string" || typeof signedXdr !== "string") {
    return NextResponse.json({ error: "missing proof" }, { status: 400 });
  }

  // Clearing is a delete, not an empty body — see `deleteDescription`.
  const clearing = body === "" || body === null;
  if (!clearing) {
    // Checked before the proof is spent, so a body that was merely too long can
    // be shortened and retried on the same signature instead of costing another
    // wallet prompt. The display-name route does the same thing for the same
    // reason.
    const problem = descriptionProblem(body);
    if (problem) {
      return NextResponse.json(
        { error: DESCRIPTION_PROBLEMS[problem], problem },
        { status: 400 },
      );
    }
  }

  // The host list comes from the contract, never from the index. The event
  // conversation already set this precedent and said why: falling back to a
  // mirrored guest list would be "deciding who may speak from a snapshot". It
  // matters more here — a snapshot of the host list is a snapshot of who may put
  // words on somebody else's event.
  //
  // And it is read *before* the proof is spent, so a bad minute on Soroban RPC
  // costs a retry rather than a second signature.
  const network = await requestNetwork();
  if (!network.contracts) {
    return NextResponse.json({ error: `not deployed on ${network.label}` }, { status: 503 });
  }

  let hosts: string[];
  try {
    hosts = (await loadEvent(network, id)).hosts;
  } catch {
    return NextResponse.json(
      { error: "couldn't check who runs this event just now" },
      { status: 503 },
    );
  }

  // 403 rather than 401: we have not asked who they are yet, but the answer
  // would not help — this address cannot write here whoever holds it. The host
  // list is public on-chain, so saying so leaks nothing.
  if (!hosts.includes(address)) {
    return NextResponse.json({ error: "only a host can describe this event" }, { status: 403 });
  }

  const proved = await spendChallenge(db, {
    address,
    nonce,
    signedXdr,
    purpose: DESCRIPTION_PURPOSE,
  });
  if (!proved) {
    return NextResponse.json({ error: "that signature isn't from this wallet" }, { status: 401 });
  }

  const factoryId = network.contracts.factoryId;
  if (clearing) {
    await deleteDescription(db, factoryId, id);
    return NextResponse.json({ description: null });
  }

  const saved = await writeDescription(db, {
    factoryId,
    eventId: id,
    body: body as string,
    authoredBy: address,
  });
  return NextResponse.json({ description: saved });
}
