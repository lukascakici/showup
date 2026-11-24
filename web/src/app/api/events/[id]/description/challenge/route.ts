import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase-admin";
import { isAccountAddress } from "@/lib/record";
import { DESCRIPTION_PURPOSE } from "@/lib/event-description";
import { issueChallenge } from "@/lib/wallet-proof";

/**
 * A challenge transaction, so a host can prove they hold the wallet they claim.
 *
 * On its own path rather than as a `GET` on `/description`, which is what the
 * display-name route does. There, `GET /api/names` issuing a challenge is
 * unsurprising because nothing else would be reading from it. Here a `GET` on
 * `/description` reads as "give me the description" to anybody who has not read
 * the file, and a route that does the opposite of what its path says is a trap
 * laid for the next person.
 *
 * The challenge is signed and **never submitted**: no fee, nothing on-chain.
 * `wallet-proof.ts` explains why a transaction and not `signMessage()` — Albedo,
 * one of the four wallets this project promises, has that stubbed out.
 *
 * It carries its own purpose. A challenge issued to claim a display name must
 * not be spendable to rewrite an event's description, and the purpose string is
 * the only thing standing between those two.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = adminFirestore();
  if (!db) {
    return NextResponse.json({ error: "descriptions are not configured" }, { status: 503 });
  }

  const address = new URL(request.url).searchParams.get("address") ?? "";
  if (!isAccountAddress(address)) {
    return NextResponse.json({ error: "not a wallet address" }, { status: 400 });
  }

  // Deliberately not checked against the event's host list here. A challenge
  // proves who is asking and nothing else; whether they may write is decided at
  // the write, against the chain. Splitting it the other way would mean the
  // answer to "are you a host" came from a read taken minutes earlier.
  return NextResponse.json(await issueChallenge(db, address, DESCRIPTION_PURPOSE));
}
