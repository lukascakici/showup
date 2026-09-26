import { NextResponse } from "next/server";
import {
  Account,
  Keypair,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { adminFirestore } from "@/lib/firebase-admin";
import { isAccountAddress } from "@/lib/record";
import { NAMES_COLLECTION, nameProblem, NAME_PROBLEMS } from "@/lib/names";

/**
 * Claim a display name for a wallet, by proving you hold it.
 *
 * **The only thing in this app a person authors**, which makes it the only thing
 * that needs a real answer to "who is asking". Every other route re-derives what it
 * writes from a contract and is therefore safe to leave open; a name cannot be
 * derived from anything, so a name claimed for somebody else's wallet is the whole
 * risk and it is not a small one — a name sits next to an attendance record and in
 * an organizer's approval queue, and the point of it is that a reader trusts it.
 *
 * ## Why a transaction and not a signed message
 *
 * `signMessage()` is the obvious tool and it cannot be used: **Albedo, one of the
 * four wallets this project promises, has it stubbed out as SEP-0043
 * incompatible.** Building name claims on it would have meant a quarter of users
 * silently unable to have a name, discovered by them rather than by us.
 *
 * Every wallet can sign a *transaction* — that is the entire app. So the proof is a
 * challenge transaction, the SEP-10 shape reduced to what is actually needed:
 *
 * 1. `GET` returns a transaction built here, sourced from the claimed account, with
 *    one `manageData` operation holding a random nonce. It is stored and expires.
 * 2. The browser signs it with whatever wallet it has.
 * 3. `POST` verifies the signature against the *claimed account's own public key*,
 *    confirms the nonce is one we issued and have not already spent, and only then
 *    writes the name.
 *
 * **Nothing is ever submitted.** The transaction exists to be signed and thrown
 * away; no fee is paid and no data entry is written on-chain. The UI says so,
 * because a wallet prompt with no explanation is how people learn to approve
 * things without reading them.
 *
 * ## What each check is actually for
 *
 * - **Signature against the claimed key.** Without it the endpoint is "name any
 *   wallet you like", which is the attack.
 * - **Nonce issued here.** Without it somebody could present a transaction they
 *   built themselves, and its source account is their own choice.
 * - **Nonce spent once.** Without it a signed challenge observed once could be
 *   replayed forever, including after its owner had changed their name back.
 * - **Nonce expires.** Limits how long a leaked signature is worth anything.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHALLENGES_COLLECTION = "nameChallenges";
const CHALLENGE_TTL_MS = 10 * 60_000;

/**
 * A sequence number of zero, and a source account object built by hand.
 *
 * The challenge is never submitted, so it does not need a real sequence number —
 * and looking one up would mean this endpoint failing for an account Horizon
 * happens to be slow about, on a page that has nothing to do with the network.
 */
function challengeFor(address: string, nonce: string): string {
  return new TransactionBuilder(new Account(address, "0"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.manageData({
        name: "showup name claim",
        value: nonce,
      }),
    )
    .setTimeout(Math.floor(CHALLENGE_TTL_MS / 1000))
    .build()
    .toXDR();
}

/** Drop challenges past their window, capped so one call cannot run long. */
async function sweepExpired(db: NonNullable<ReturnType<typeof adminFirestore>>) {
  const stale = await db
    .collection(CHALLENGES_COLLECTION)
    .where("issuedAt", "<", Date.now() - CHALLENGE_TTL_MS)
    .limit(200)
    .get();
  if (stale.empty) return;

  const batch = db.batch();
  for (const doc of stale.docs) batch.delete(doc.ref);
  await batch.commit();
}

export async function GET(request: Request) {
  const db = adminFirestore();
  if (!db) {
    return NextResponse.json({ error: "names are not configured" }, { status: 503 });
  }

  const address = new URL(request.url).searchParams.get("address") ?? "";
  if (!isAccountAddress(address)) {
    return NextResponse.json({ error: "not a wallet address" }, { status: 400 });
  }

  const nonce = crypto.randomUUID();
  await db
    .collection(CHALLENGES_COLLECTION)
    .doc(nonce)
    .set({ address, issuedAt: Date.now() });

  // Sweep the expired ones while we are here.
  //
  // A challenge is deleted when it is presented, but not every one is: somebody
  // who opens the field and walks away leaves one behind, and so does a claim
  // refused for the *name* rather than the proof — deliberately, so a corrected
  // name can be retried on the same signature instead of asking for another
  // wallet prompt. Without this the collection only ever grows. Not awaited,
  // because a slow sweep must not delay the prompt the visitor is waiting on.
  void sweepExpired(db).catch(() => {});

  return NextResponse.json({ nonce, xdr: challengeFor(address, nonce) });
}

export async function POST(request: Request) {
  const db = adminFirestore();
  if (!db) {
    return NextResponse.json({ error: "names are not configured" }, { status: 503 });
  }

  let body: { address?: unknown; name?: unknown; nonce?: unknown; signedXdr?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const { address, name, nonce, signedXdr } = body;
  if (!isAccountAddress(address as string)) {
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
    const problem = nameProblem(name);
    if (problem) {
      return NextResponse.json({ error: NAME_PROBLEMS[problem], problem }, { status: 400 });
    }
  }

  // The nonce has to be one we issued, for this address, recently, and unspent.
  const ref = db.collection(CHALLENGES_COLLECTION).doc(nonce);
  const challenge = await ref.get();
  if (!challenge.exists) {
    return NextResponse.json({ error: "that proof has expired or was already used" }, { status: 400 });
  }
  const issued = challenge.data() as { address: string; issuedAt: number };
  if (issued.address !== address || Date.now() - issued.issuedAt > CHALLENGE_TTL_MS) {
    // Deleted either way: a challenge that has been presented wrongly once is not
    // worth keeping alive for a second attempt.
    await ref.delete();
    return NextResponse.json({ error: "that proof has expired or was already used" }, { status: 400 });
  }

  let verified = false;
  try {
    const tx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);

    // A fee-bump wraps somebody else's transaction and has no `source` of its own.
    // Refused rather than unwrapped: a fee bump preserves the *inner* transaction's
    // signatures, so verifying the outer envelope's hash would be checking the
    // wrong thing. Falls through to `verified = false` rather than returning early,
    // so the nonce below is still spent — an unverified attempt must not leave a
    // challenge alive for a second try.
    if (tx instanceof Transaction) {
      const op = tx.operations[0];

      const sourceIsClaimant = tx.source === address;
      const carriesOurNonce =
        op?.type === "manageData" &&
        op.name === "showup name claim" &&
        op.value?.toString() === nonce;

      // The one check that cannot be skipped: the signature has to be the claimed
      // account's own. Everything above only establishes *what* was signed.
      const key = Keypair.fromPublicKey(address as string);
      const hash = tx.hash();
      const signed = tx.signatures.some((sig) => {
        try {
          return key.verify(hash, sig.signature());
        } catch {
          return false;
        }
      });

      verified = sourceIsClaimant && carriesOurNonce && signed;
    }
  } catch {
    verified = false;
  }

  // Spent whether or not it verified, so a signature cannot be brute-forced
  // against one challenge.
  await ref.delete();

  if (!verified) {
    return NextResponse.json({ error: "that signature isn't from this wallet" }, { status: 401 });
  }

  const docRef = db.collection(NAMES_COLLECTION).doc(address as string);
  if (clearing) {
    await docRef.delete();
    return NextResponse.json({ name: null });
  }

  await docRef.set({ address, name, claimedAt: Date.now() });
  return NextResponse.json({ name });
}
