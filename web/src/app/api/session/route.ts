import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase-admin";
import { isAccountAddress } from "@/lib/record";
import { issueChallenge, mintSession, sessionSecret, spendChallenge } from "@/lib/wallet-proof";

/**
 * One wallet prompt, then a few hours of being recognised.
 *
 * The event conversation needs to know who is writing, and the only proof this app
 * can get is a signed challenge transaction. Asking for one per message would make
 * a conversation unusable, so the signature buys a short-lived token instead.
 *
 * **Stateless on purpose.** The token is `<address>.<expiry>.<hmac>`, so there is no
 * session table to grow, nothing to clean up, and no lookup on the path of every
 * message. Revocation is the expiry, which is the honest trade for a feature whose
 * worst case is somebody posting in a group chat they left.
 *
 * With no `SESSION_SECRET` configured this returns 503 and the conversation is
 * simply off. Falling back to unsigned tokens would make forging a session the
 * default in any environment somebody forgot to set up, which is exactly the shape
 * of the `CRON_SECRET` bug this project already had once.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PURPOSE = "session";

export async function GET(request: Request) {
  const db = adminFirestore();
  if (!db || !sessionSecret()) {
    return NextResponse.json({ error: "sessions are not configured" }, { status: 503 });
  }

  const address = new URL(request.url).searchParams.get("address") ?? "";
  if (!isAccountAddress(address)) {
    return NextResponse.json({ error: "not a wallet address" }, { status: 400 });
  }

  return NextResponse.json(await issueChallenge(db, address, PURPOSE));
}

export async function POST(request: Request) {
  const db = adminFirestore();
  const secret = sessionSecret();
  if (!db || !secret) {
    return NextResponse.json({ error: "sessions are not configured" }, { status: 503 });
  }

  let body: { address?: unknown; nonce?: unknown; signedXdr?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const { address, nonce, signedXdr } = body;
  if (typeof address !== "string" || !isAccountAddress(address)) {
    return NextResponse.json({ error: "not a wallet address" }, { status: 400 });
  }
  if (typeof nonce !== "string" || typeof signedXdr !== "string") {
    return NextResponse.json({ error: "missing proof" }, { status: 400 });
  }

  const proved = await spendChallenge(db, { address, nonce, signedXdr, purpose: PURPOSE });
  if (!proved) {
    return NextResponse.json({ error: "that signature isn't from this wallet" }, { status: 401 });
  }

  return NextResponse.json({ token: mintSession(address, secret) });
}
