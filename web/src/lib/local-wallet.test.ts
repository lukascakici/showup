import {
  Account,
  Keypair,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { beforeEach, describe, expect, it } from "vitest";
import { network } from "./networks";
import {
  createLocalWallet,
  forgetLocalWallet,
  loadLocalWallet,
  localWalletAllowed,
  secretFileBody,
  secretFileName,
  signWith,
} from "./local-wallet";

const TESTNET = network("testnet");
const MAINNET = network("mainnet");

beforeEach(() => {
  window.localStorage.clear();
});

/**
 * An unsigned transaction to hand the signer.
 *
 * A bump-sequence operation because it is the cheapest valid operation there is
 * and this is not testing what the transaction does — only that the right key
 * put a signature on it, over the right network.
 */
function unsigned(passphrase: string): string {
  // A made-up sequence number: nothing here is ever submitted.
  const source = new Account(Keypair.random().publicKey(), "1");
  return new TransactionBuilder(source, { fee: "100", networkPassphrase: passphrase })
    .addOperation(Operation.bumpSequence({ bumpTo: "2" }))
    .setTimeout(30)
    .build()
    .toXDR();
}

describe("creating one", () => {
  it("generates a usable Stellar keypair", () => {
    const wallet = createLocalWallet(TESTNET);
    expect(wallet).not.toBeNull();
    expect(wallet!.publicKey).toMatch(/^G[A-Z2-7]{55}$/);
    expect(wallet!.secret).toMatch(/^S[A-Z2-7]{55}$/);
    // The pair agrees with itself, which is the only thing that makes the stored
    // secret usable at all.
    expect(Keypair.fromSecret(wallet!.secret).publicKey()).toBe(wallet!.publicKey);
  });

  it("survives a reload", () => {
    const made = createLocalWallet(TESTNET);
    expect(loadLocalWallet(TESTNET)).toEqual(made);
  });

  /**
   * The one that protects somebody's deposit. A second call that quietly minted
   * a new key would strand whatever the first one had reserved — the funds and
   * the on-chain record would belong to an address the app had just forgotten.
   */
  it("returns the existing wallet instead of replacing it", () => {
    const first = createLocalWallet(TESTNET);
    const second = createLocalWallet(TESTNET);
    expect(second).toEqual(first);
    expect(createLocalWallet(TESTNET)!.secret).toBe(first!.secret);
  });

  it("stores only the secret, so the public key cannot disagree with it", () => {
    const wallet = createLocalWallet(TESTNET);
    const raw = window.localStorage.getItem("showup.local-wallet.testnet");
    expect(JSON.parse(raw!)).toBe(wallet!.secret);
    expect(raw).not.toContain(wallet!.publicKey);
  });
});

describe("the real-money refusal", () => {
  it("allows Testnet and refuses Mainnet", () => {
    expect(localWalletAllowed(TESTNET)).toBe(true);
    expect(localWalletAllowed(MAINNET)).toBe(false);
  });

  /**
   * Each entry point is checked on its own rather than through the UI, because
   * the guard is deliberately here and not there. A key in `localStorage` is
   * readable by anything that gets onto the page; that is an acceptable trade for
   * money that is free and worth nothing, and not for money that is not.
   */
  it("will not create one on Mainnet", () => {
    expect(createLocalWallet(MAINNET)).toBeNull();
    expect(window.localStorage.getItem("showup.local-wallet.mainnet")).toBeNull();
    // Nothing was written under any key, not just not under that one.
    expect(window.localStorage.length).toBe(0);
  });

  it("will not read one on Mainnet even if a key is sitting there", () => {
    // Planted directly, which is the case the guard exists for: a key that got
    // into storage by some route other than `createLocalWallet` — an older
    // build, a copied profile, somebody's console.
    window.localStorage.setItem(
      "showup.local-wallet.mainnet",
      JSON.stringify(Keypair.random().secret()),
    );
    expect(loadLocalWallet(MAINNET)).toBeNull();
  });

  it("will not sign on Mainnet, with a wallet it refuses to admit exists", async () => {
    // Built on Testnet — the only way to get a wallet object at all — and then
    // pointed at Mainnet, which is exactly the shape of the bug this catches: a
    // component that held onto a wallet across a network change.
    const wallet = createLocalWallet(TESTNET)!;
    await expect(signWith(wallet, MAINNET)(unsigned(Networks.PUBLIC))).rejects.toThrow(
      /real-money/i,
    );
  });
});

describe("signing", () => {
  it("puts the local key's signature on the transaction", async () => {
    const wallet = createLocalWallet(TESTNET)!;
    const { signedTxXdr, signerAddress } = await signWith(wallet, TESTNET)(
      unsigned(Networks.TESTNET),
    );

    expect(signerAddress).toBe(wallet.publicKey);
    const signed = new Transaction(signedTxXdr, Networks.TESTNET);
    expect(signed.signatures).toHaveLength(1);
    // The signature verifies against this key and no other: proof it was signed
    // rather than merely re-serialised.
    expect(
      Keypair.fromPublicKey(wallet.publicKey).verify(
        signed.hash(),
        signed.signatures[0].signature,
      ),
    ).toBe(true);
  });

  /**
   * A Stellar signature covers the network passphrase, so signing over the wrong
   * one produces a signature that is valid-looking and rejected by the network.
   * The caller's passphrase has to win, because the generated contract clients
   * pass it explicitly.
   */
  it("honours the passphrase it is given", async () => {
    const wallet = createLocalWallet(TESTNET)!;
    const { signedTxXdr } = await signWith(wallet, TESTNET)(unsigned(Networks.FUTURENET), {
      networkPassphrase: Networks.FUTURENET,
    });
    const signed = new Transaction(signedTxXdr, Networks.FUTURENET);
    expect(
      Keypair.fromPublicKey(wallet.publicKey).verify(
        signed.hash(),
        signed.signatures[0].signature,
      ),
    ).toBe(true);
  });
});

describe("storage that misbehaves", () => {
  it("treats a corrupt value as no wallet rather than throwing", () => {
    window.localStorage.setItem("showup.local-wallet.testnet", "not json at all");
    expect(loadLocalWallet(TESTNET)).toBeNull();
  });

  it("treats a well-formed value that is not a Stellar secret as no wallet", () => {
    window.localStorage.setItem("showup.local-wallet.testnet", JSON.stringify("SNOPE"));
    expect(loadLocalWallet(TESTNET)).toBeNull();
    window.localStorage.setItem("showup.local-wallet.testnet", JSON.stringify({ secret: 1 }));
    expect(loadLocalWallet(TESTNET)).toBeNull();
  });

  it("keeps each network's key separate", () => {
    createLocalWallet(TESTNET);
    expect(window.localStorage.getItem("showup.local-wallet.testnet")).not.toBeNull();
    expect(window.localStorage.getItem("showup.local-wallet.mainnet")).toBeNull();
  });
});

describe("forgetting one", () => {
  it("removes the key", () => {
    createLocalWallet(TESTNET);
    forgetLocalWallet(TESTNET);
    expect(loadLocalWallet(TESTNET)).toBeNull();
    expect(window.localStorage.getItem("showup.local-wallet.testnet")).toBeNull();
  });

  it("is quiet when there was nothing to forget", () => {
    expect(() => forgetLocalWallet(TESTNET)).not.toThrow();
  });

  /** There is no undo, and the next create must not resurrect the old one. */
  it("really is gone — a later create makes a different key", () => {
    const first = createLocalWallet(TESTNET)!;
    forgetLocalWallet(TESTNET);
    expect(createLocalWallet(TESTNET)!.secret).not.toBe(first.secret);
  });
});

describe("the exported file", () => {
  it("is named so it can be recognised months later", () => {
    const wallet = createLocalWallet(TESTNET)!;
    const name = secretFileName(wallet.publicKey);
    expect(name).toContain("showup");
    expect(name).toContain("testnet");
    expect(name).toContain(wallet.publicKey.slice(0, 8));
    expect(name.endsWith(".txt")).toBe(true);
  });

  it("carries the secret, the address, and what they are", () => {
    const wallet = createLocalWallet(TESTNET)!;
    const body = secretFileBody(wallet);
    expect(body).toContain(wallet.secret);
    expect(body).toContain(wallet.publicKey);
    // The two things somebody opening this file in six months needs told: that
    // it is worthless, and that nobody can send them another copy.
    expect(body).toMatch(/TEST network/);
    expect(body).toMatch(/cannot recover/i);
  });
});
