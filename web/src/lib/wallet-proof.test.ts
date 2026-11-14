// @vitest-environment node
//
// Not jsdom, which is this project's default. Everything here is server-side
// crypto, and jsdom puts the test in a second JS realm: `Buffer.from()` then
// produces a Node-realm `Uint8Array` that fails stellar-sdk v17's
// `instanceof Uint8Array` check, so building a `manageData` operation throws
// "expected Uint8Array". Next runs this module on the server, in one realm,
// where that cannot happen.
import { Account, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { mintSession, readSession, sessionSecret } from "./session-token";
import { spendChallenge } from "./wallet-proof";

/**
 * The session token is the credential that decides who may write in an event's
 * conversation, so everything here is a way one could be accepted when it should
 * not be.
 */

const ADDRESS = "GBQRAWAAWGSS2G5G4BWAN3XJBGGEXYDJM66S7Z6TPULGLEDC7RE2O4PW";
const OTHER = "GA5TJJJCL2VXRFJPEQW42Q5GC7NOXWIXZRGOI77TEOW42OTW6KEVNGEO";
const SECRET = "a".repeat(48);
const NOW = 1_800_000_000_000;

/** Two throwaway keypairs: the wallet a challenge is issued to, and an attacker. */
const WALLET = Keypair.random();
const INTRUDER = Keypair.random();

describe("a wallet session token", () => {
  it("reads back the address it was minted for", () => {
    const token = mintSession(ADDRESS, SECRET, NOW);
    expect(readSession(token, SECRET, NOW + 1000)).toBe(ADDRESS);
  });

  it("is refused once it expires", () => {
    const token = mintSession(ADDRESS, SECRET, NOW);
    // Twelve hours plus a second. An expiry that is not enforced is not an expiry,
    // and it is the only revocation a stateless token has.
    expect(readSession(token, SECRET, NOW + 12 * 3600_000 + 1000)).toBeNull();
  });

  it("is refused under a different secret", () => {
    expect(readSession(mintSession(ADDRESS, SECRET, NOW), "b".repeat(48), NOW)).toBeNull();
  });

  it("cannot have its address swapped", () => {
    // The obvious forgery: take a valid token and change whose it is. The MAC
    // covers the address, so this has to fail.
    const token = mintSession(ADDRESS, SECRET, NOW);
    const [, expires, mac] = token.split(".");
    expect(readSession(`${OTHER}.${expires}.${mac}`, SECRET, NOW)).toBeNull();
  });

  it("cannot have its expiry extended", () => {
    const token = mintSession(ADDRESS, SECRET, NOW);
    const [address, , mac] = token.split(".");
    const forever = String(NOW + 365 * 24 * 3600_000);
    expect(readSession(`${address}.${forever}.${mac}`, SECRET, NOW)).toBeNull();
  });

  it("refuses anything that is not three parts", () => {
    for (const bad of ["", ADDRESS, `${ADDRESS}.1`, `${ADDRESS}.1.a.b`, "..."]) {
      expect(readSession(bad, SECRET, NOW), bad).toBeNull();
    }
  });

  it("refuses a token whose address is not an address", () => {
    // Otherwise the address half is free-form text that later code trusts as a
    // wallet — including as the `from` on a message.
    const token = mintSession(ADDRESS, SECRET, NOW);
    const [, expires] = token.split(".");
    expect(readSession(`not-a-wallet.${expires}.anything`, SECRET, NOW)).toBeNull();
  });

  it("refuses an unparseable expiry rather than treating it as now", () => {
    const token = mintSession(ADDRESS, SECRET, NOW);
    const [address, , mac] = token.split(".");
    expect(readSession(`${address}.later.${mac}`, SECRET, NOW)).toBeNull();
  });
});

describe("the secret the whole thing rests on", () => {
  it("treats a missing or short secret as the feature being off", () => {
    // Not "insecure by default": an app that fell back to unsigned tokens would
    // make forging a session the norm in any environment somebody forgot to
    // configure, which is exactly the shape of the CRON_SECRET bug this project
    // already had once.
    const original = process.env.SESSION_SECRET;
    try {
      delete process.env.SESSION_SECRET;
      expect(sessionSecret()).toBeNull();
      process.env.SESSION_SECRET = "too-short";
      expect(sessionSecret()).toBeNull();
      process.env.SESSION_SECRET = SECRET;
      expect(sessionSecret()).toBe(SECRET);
    } finally {
      if (original === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = original;
    }
  });
});

/**
 * The signature check itself, which until now had no test.
 *
 * It is the one door that cannot be left ajar — without it the endpoints that
 * take a wallet proof become "act as any wallet you like" — and it reads a
 * signature straight off the parsed envelope, so it is also the code most
 * exposed to an XDR-layer change in the SDK. A stellar-sdk v17 upgrade moved
 * `DecoratedSignature.signature` from a method to a property, which type-checks
 * either way at the call site only because the old form was a call on a value
 * that is now not callable. These cover the behaviour instead.
 */
describe("the wallet signature check", () => {
  const PURPOSE = "set-name";
  const NONCE = "11111111-2222-3333-4444-555555555555";

  /** Just enough Firestore for `spendChallenge`: one document, and a delete. */
  function fakeDb(stored: { address: string; purpose: string; issuedAt: number } | null) {
    const deleted: string[] = [];
    const db = {
      collection: () => ({
        doc: (id: string) => ({
          get: async () => ({ exists: stored !== null, data: () => stored }),
          delete: async () => {
            deleted.push(id);
          },
        }),
      }),
    };
    return { db, deleted };
  }

  function signedChallenge(signer: Keypair, source = signer.publicKey(), nonce = NONCE) {
    const tx = new TransactionBuilder(new Account(source, "0"), {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.manageData({ name: "showup wallet proof", value: nonce }))
      .setTimeout(600)
      .build();
    tx.sign(signer);
    return tx.toXDR();
  }

  const issued = () => ({ address: WALLET.publicKey(), purpose: PURPOSE, issuedAt: Date.now() });

  it("accepts a challenge signed by the wallet it was issued to", async () => {
    const { db } = fakeDb(issued());
    const ok = await spendChallenge(db as never, {
      address: WALLET.publicKey(),
      nonce: NONCE,
      signedXdr: signedChallenge(WALLET),
      purpose: PURPOSE,
    });
    expect(ok).toBe(true);
  });

  it("refuses a challenge signed by a different wallet", async () => {
    // The attack: present the right nonce, for the right address, signed with a
    // key you actually hold. Only the signature check closes this.
    const { db } = fakeDb(issued());
    const ok = await spendChallenge(db as never, {
      address: WALLET.publicKey(),
      nonce: NONCE,
      signedXdr: signedChallenge(INTRUDER, WALLET.publicKey()),
      purpose: PURPOSE,
    });
    expect(ok).toBe(false);
  });

  it("refuses an unsigned challenge", async () => {
    const { db } = fakeDb(issued());
    const unsigned = new TransactionBuilder(new Account(WALLET.publicKey(), "0"), {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.manageData({ name: "showup wallet proof", value: NONCE }))
      .setTimeout(600)
      .build()
      .toXDR();

    const ok = await spendChallenge(db as never, {
      address: WALLET.publicKey(),
      nonce: NONCE,
      signedXdr: unsigned,
      purpose: PURPOSE,
    });
    expect(ok).toBe(false);
  });

  it("refuses a nonce that was never issued", async () => {
    const { db } = fakeDb(null);
    const ok = await spendChallenge(db as never, {
      address: WALLET.publicKey(),
      nonce: NONCE,
      signedXdr: signedChallenge(WALLET),
      purpose: PURPOSE,
    });
    expect(ok).toBe(false);
  });

  it("refuses a challenge issued for a different purpose", async () => {
    const { db } = fakeDb({ ...issued(), purpose: "other" });
    const ok = await spendChallenge(db as never, {
      address: WALLET.publicKey(),
      nonce: NONCE,
      signedXdr: signedChallenge(WALLET),
      purpose: PURPOSE,
    });
    expect(ok).toBe(false);
  });

  it("spends the nonce even when the signature fails, so it cannot be retried", async () => {
    const { db, deleted } = fakeDb(issued());
    await spendChallenge(db as never, {
      address: WALLET.publicKey(),
      nonce: NONCE,
      signedXdr: signedChallenge(INTRUDER, WALLET.publicKey()),
      purpose: PURPOSE,
    });
    expect(deleted).toEqual([NONCE]);
  });
});
