import { errMessage } from "./stellar";

/**
 * What a wallet failure means for the UI.
 *
 * Every failure the kit surfaces is a plain object — `{ code, message, ext? }`
 * assembled by its own `parseError`, never an `Error` — so nothing here may lean on
 * `instanceof`. Nor can `code` identify a failure by itself: `parseError` falls back
 * to `-1` for anything that arrives without one, and `-3` means "Please set the
 * wallet first" coming from the kit but "Intent request is invalid" coming from
 * Albedo. So the code narrows and the message decides.
 */
export type WalletFailure = {
  /** Copy to show, or null when the user simply backed out and nothing is wrong. */
  message: string | null;
  /**
   * The remembered wallet can no longer be resolved. The kit's stored selection has
   * to be cleared before any later call will work.
   */
  stale: boolean;
};

const REJECTED = "You rejected the request in your wallet.";
const CONNECT_FIRST = "Connect a wallet first.";

export function readWalletError(err: unknown): WalletFailure {
  const message = errMessage(err);
  const code = errCode(err);

  // Closing the xBull window mid-request completes its stream without ever emitting,
  // and what reaches us is rxjs's EmptyError text. Nothing failed — they backed out.
  if (/no elements in sequence/i.test(message)) return { message: null, stale: false };

  // A wallet id remembered from a build that offered more wallets than this one.
  // The kit's message carries an upstream typo, matched here exactly as it is thrown.
  if (/is not and existing module/i.test(message)) {
    return { message: "That wallet isn't available here. Pick another one.", stale: true };
  }
  if (code === -3 && /set the wallet first/i.test(message)) {
    return { message: CONNECT_FIRST, stale: true };
  }

  // Not-installed and not-unlocked, raised by each module's own pre-flight check.
  if (/Freighter is not connected/i.test(message)) {
    return show("Freighter isn't available. Install it, or unlock it and reload.");
  }
  if (/Hana Wallet is not installed/i.test(message)) {
    return show("Hana Wallet isn't installed.");
  }
  if (/xBull Wallet is not open/i.test(message)) {
    return show("The xBull window didn't open — allow pop-ups for this site and retry.");
  }
  if (/Getting the address from Freighter is not allowed/i.test(message)) {
    return show("Freighter didn't share an address. Approve the connection and retry.");
  }

  // Rejection. Albedo and Freighter both report it as -4; xBull's bridge says it in
  // words instead ("Request rejected from the wallet"), and Hana's wording is its
  // own — which is why the text is matched as well as the code.
  if (code === -4 || /reject|declin|denied|cancel/i.test(message)) return show(REJECTED);

  if (/no active address|no wallet has been connected/i.test(message)) {
    return show(CONNECT_FIRST);
  }

  // `parseError`'s own last resort, which tells the user nothing.
  if (!message || /unhandled error/i.test(message)) {
    return show("Your wallet couldn't complete that. Please try again.");
  }
  return show(message);
}

/** The copy for a wallet failure, or null when the user just backed out. */
export function friendlyWalletError(err: unknown): string | null {
  return readWalletError(err).message;
}

function show(message: string): WalletFailure {
  return { message, stale: false };
}

function errCode(err: unknown): number | null {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "number") return code;
  }
  return null;
}
