import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import type { Network } from "./networks";
import type { SignFn } from "./stellar";

/**
 * A Stellar keypair generated in the browser, so somebody with no wallet
 * installed can still reserve a spot.
 *
 * Deliverable 3 depends on strangers finishing a reservation unattended on their
 * own phone. Four wallets are offered and three of them need an install; the
 * fourth opens a pop-up. This is the path for the person who bounces at all four.
 *
 * ## Testnet only, and enforced here rather than hidden in the UI
 *
 * **The key lives in `localStorage`.** That is readable by any script that gets
 * onto the page, and the honest reading of that is: this is fine for money that
 * is free and worth nothing, and completely unacceptable for money that is not.
 * An in-app key holding real funds is custody — a different product, with
 * obligations this one has not taken on.
 *
 * So every entry point below refuses on a real-money network, in this file. Not
 * a hidden button, not a disabled control: `create`, `load` and `signWith` all
 * return nothing on Mainnet, so a bug in a component cannot produce a local
 * wallet there. The UI is a second line, and the comment that matters is this
 * one.
 *
 * ## Export is the feature
 *
 * A key the app holds and the person does not is the app's key. The screen shows
 * the secret once, offers it as a file, and says plainly that it cannot be
 * recovered — because it cannot: nothing here is ever sent anywhere.
 */

/** Scoped by network, so one chain's key can never be read as another's. */
const key = (network: Network) => `showup.local-wallet.${network.id}`;

export type LocalWallet = {
  publicKey: string;
  secret: string;
};

/**
 * The one guard. Everything else in this file calls it first.
 *
 * Written as "may this network have one" rather than "is this Testnet" so that a
 * third network added later inherits the refusal by default instead of needing
 * somebody to remember this file exists.
 */
export function localWalletAllowed(network: Network): boolean {
  return !network.isRealMoney;
}

export function loadLocalWallet(network: Network): LocalWallet | null {
  if (!localWalletAllowed(network)) return null;
  if (typeof window === "undefined") return null;

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key(network));
  } catch {
    // Safari in private mode throws on access rather than returning null.
    return null;
  }
  if (!raw) return null;

  try {
    const secret = JSON.parse(raw) as unknown;
    if (typeof secret !== "string") return null;
    // Derived rather than stored alongside: a public key saved next to its
    // secret is a second copy that can disagree with it, and the only honest
    // answer to "which is right" is the one the secret produces.
    return { publicKey: Keypair.fromSecret(secret).publicKey(), secret };
  } catch {
    // A corrupt or non-Stellar value. Treated as absent rather than thrown:
    // there is nothing here worth taking the page down for.
    return null;
  }
}

/**
 * Make one, or return the one that already exists.
 *
 * Deliberately not "always make a new one". A second call that silently
 * replaced the key would strand whatever the first one had reserved, and the
 * deposit with it.
 */
export function createLocalWallet(network: Network): LocalWallet | null {
  if (!localWalletAllowed(network)) return null;
  if (typeof window === "undefined") return null;

  const existing = loadLocalWallet(network);
  if (existing) return existing;

  const keypair = Keypair.random();
  const wallet = { publicKey: keypair.publicKey(), secret: keypair.secret() };
  try {
    window.localStorage.setItem(key(network), JSON.stringify(wallet.secret));
  } catch {
    // Storage refused — private mode, or a full quota. The wallet is still
    // returned so the session can use it, and the export screen is then the
    // only copy that will ever exist. That is worth saying out loud to the
    // person, which the component does.
    return wallet;
  }
  return wallet;
}

/**
 * Forget the key.
 *
 * There is no undo and the screen says so. Keeping a "deleted" key around to be
 * helpful would mean the delete button does not do what it says.
 */
export function forgetLocalWallet(network: Network): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(network));
  } catch {
    // Nothing to do, and nothing to tell: the key was never stored.
  }
}

/**
 * Sign with the local key, in the same shape the wallet kit returns.
 *
 * Returning the kit's shape means every caller — `claimName`, `describeEvent`,
 * every contract client — works unchanged. None of them should know or care
 * which kind of wallet signed.
 */
export function signWith(wallet: LocalWallet, network: Network): SignFn {
  return async (xdr, opts) => {
    if (!localWalletAllowed(network)) {
      // Unreachable while `create` and `load` refuse first, and still here: this
      // is the function that would move real money if the other two were ever
      // wrong, so it does not rely on them having been right.
      throw new Error("An in-app wallet cannot sign on a real-money network.");
    }
    const passphrase = opts?.networkPassphrase ?? network.passphrase;
    const tx = TransactionBuilder.fromXDR(xdr, passphrase);
    tx.sign(Keypair.fromSecret(wallet.secret));
    return { signedTxXdr: tx.toXDR(), signerAddress: wallet.publicKey };
  };
}

/** The filename somebody will find in their downloads in six months. */
export const secretFileName = (publicKey: string) =>
  `showup-testnet-key-${publicKey.slice(0, 8)}.txt`;

/**
 * What goes in the file.
 *
 * The public key and a sentence of context alongside the secret, because a bare
 * 56-character string in a downloads folder is indistinguishable from any other
 * and will be opened by somebody who no longer remembers what it was.
 */
export function secretFileBody(wallet: LocalWallet): string {
  return [
    "Showup — Stellar Testnet key",
    "",
    `Public key: ${wallet.publicKey}`,
    `Secret key: ${wallet.secret}`,
    "",
    "This is a TEST network key. The XLM it holds is free and worth nothing",
    "anywhere. Do not send real funds to this address.",
    "",
    "Showup never had a copy of this secret and cannot recover it.",
    "",
  ].join("\n");
}
