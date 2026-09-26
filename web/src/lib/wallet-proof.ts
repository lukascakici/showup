import "server-only";

import {
  Account,
  Keypair,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import type { Firestore } from "firebase-admin/firestore";
import { isAccountAddress } from "./record";

/**
 * Proving that a browser holds a particular wallet, in the two shapes the app
 * needs it: a one-off proof, and a session.
 *
 * ## Why a transaction and not a signed message
 *
 * `signMessage()` is the obvious tool and it cannot be used: **Albedo, one of the
 * four wallets this project promises, has it stubbed out as SEP-0043
 * incompatible.** Building on it would have meant a quarter of users silently
 * unable to do anything that needs proof, and they would have been the ones to
 * find out.
 *
 * Every wallet can sign a *transaction* — that is the entire app. So the proof is a
 * challenge transaction: built here, sourced from the claimed account, carrying a
 * nonce we issued. It is **never submitted**, no fee is paid and nothing is written
 * on-chain. Every screen that triggers one says so, because a wallet prompt with no
 * explanation is how people learn to approve things without reading them.
 *
 * ## One copy, deliberately
 *
 * This started as part of the display-name route and moved here the moment a second
 * caller wanted it. Signature verification is the last code in a project that
 * should exist twice: a fix applied to one copy and not the other is a hole nobody
 * can see by reading either file.
 */

const CHALLENGES = "walletChallenges";
const CHALLENGE_TTL_MS = 10 * 60_000;

/** What the `manageData` key says, so a signer can read what they are signing. */
const CHALLENGE_LABEL = "showup wallet proof";

export type Challenge = { nonce: string; xdr: string };

/**
 * A sequence number of zero, and a source account object built by hand.
 *
 * The challenge is never submitted, so it needs no real sequence number — and
 * looking one up would mean this failing whenever Horizon is slow, on a screen that
 * has nothing to do with the network.
 */
export async function issueChallenge(
  db: Firestore,
  address: string,
  purpose: string,
): Promise<Challenge> {
  const nonce = crypto.randomUUID();
  await db.collection(CHALLENGES).doc(nonce).set({ address, purpose, issuedAt: Date.now() });

  const xdr = new TransactionBuilder(new Account(address, "0"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.manageData({ name: CHALLENGE_LABEL, value: nonce }))
    .setTimeout(Math.floor(CHALLENGE_TTL_MS / 1000))
    .build()
    .toXDR();

  // Sweep the expired ones while we are here. A challenge is deleted when it is
  // presented, but not every one is: somebody who opens a field and walks away
  // leaves one behind. Not awaited, so a slow sweep cannot delay the prompt the
  // visitor is waiting on.
  void sweepExpired(db).catch(() => {});

  return { nonce, xdr };
}

async function sweepExpired(db: Firestore) {
  const stale = await db
    .collection(CHALLENGES)
    .where("issuedAt", "<", Date.now() - CHALLENGE_TTL_MS)
    .limit(200)
    .get();
  if (stale.empty) return;
  const batch = db.batch();
  for (const doc of stale.docs) batch.delete(doc.ref);
  await batch.commit();
}

/**
 * Spend a challenge and say whether the signature really is that wallet's.
 *
 * The nonce is deleted **whether or not it verified**, so a failed attempt cannot
 * leave a challenge alive to be tried against again.
 *
 * Four checks, and each one closes a different door:
 *
 * - **Signature against the claimed key** — without it the endpoint is "act as any
 *   wallet you like", which is the whole attack.
 * - **Nonce issued here, for this address, for this purpose** — without it a caller
 *   can present a transaction they built themselves, and its source account is
 *   their own choice.
 * - **Spent once** — without it an observed signature is a permanent credential.
 * - **Expires** — bounds how long a leaked one is worth anything.
 */
export async function spendChallenge(
  db: Firestore,
  {
    address,
    nonce,
    signedXdr,
    purpose,
  }: { address: string; nonce: string; signedXdr: string; purpose: string },
): Promise<boolean> {
  if (!isAccountAddress(address)) return false;

  const ref = db.collection(CHALLENGES).doc(nonce);
  const snapshot = await ref.get();
  if (!snapshot.exists) return false;

  const issued = snapshot.data() as { address: string; purpose: string; issuedAt: number };
  await ref.delete();

  if (issued.address !== address) return false;
  if (issued.purpose !== purpose) return false;
  if (Date.now() - issued.issuedAt > CHALLENGE_TTL_MS) return false;

  try {
    const tx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
    // A fee bump wraps somebody else's transaction and preserves the *inner*
    // signatures, so verifying the outer envelope's hash would be checking the
    // wrong thing. Refused rather than unwrapped.
    if (!(tx instanceof Transaction)) return false;

    const op = tx.operations[0];
    if (tx.source !== address) return false;
    if (op?.type !== "manageData") return false;
    if (op.name !== CHALLENGE_LABEL) return false;
    if (op.value?.toString() !== nonce) return false;

    const key = Keypair.fromPublicKey(address);
    const hash = tx.hash();
    return tx.signatures.some((sig) => {
      try {
        return key.verify(hash, sig.signature());
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

export { mintSession, readSession, sessionSecret } from "./session-token";
