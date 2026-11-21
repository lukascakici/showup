import {
  Client as FactoryClient,
  type Admission,
  type ForfeitPolicy,
} from "factory-client";
import { Client as EventClient } from "event-client";
import { Client as ReputationClient, type Score } from "reputation-client";
import { errMessage, type SignFn } from "./stellar";
import { defaultNetwork, type Network, type NetworkContracts } from "./networks";
import { readWalletError } from "./wallet-errors";

/**
 * The default network's addresses, for callers not yet given a network.
 *
 * The contract addresses come out of the generated bindings rather than being
 * typed anywhere — see `networks.ts` — so a redeploy is a regeneration and never
 * an edit somebody can forget. `contracts.test.ts` pins them against
 * docs/deployments.md, because a binding regenerated against a stale contract
 * looks exactly like working code.
 */
const fallback = defaultNetwork();
const fallbackContracts = fallback.contracts!; // `defaultNetwork` only returns live networks

export const SOROBAN_RPC_URL = fallback.sorobanRpcUrl;
export const FACTORY_ID = fallbackContracts.factoryId;
export const REPUTATION_ID = fallbackContracts.reputationId;

/**
 * The Stellar Asset Contract for native XLM.
 *
 * Derived from the network passphrase rather than written down: this address is
 * a hash of the asset and the network, so Mainnet's is a different value and
 * transcribing either is a silent way to point a deposit at the wrong contract.
 */
export const NATIVE_SAC = fallback.nativeSac;

export const STROOPS_PER_XLM = 10_000_000n;

/** What each guest is reimbursed on check-in, to cover the fees they spent. */
export const FEE_ALLOWANCE_STROOPS = 1_000_000n; // 0.1 XLM

export type { Admission, ForfeitPolicy };

type ClientOpts = {
  publicKey?: string;
  signTransaction?: SignFn;
  /**
   * Which network to talk to. Omitted means the default one, which is right for
   * a caller that has no event in hand and wrong for one that does — an event
   * belongs to exactly one network, and reading it on the other finds nothing.
   */
  network?: Network;
};

function baseOptions(opts: ClientOpts) {
  const on = opts.network ?? fallback;
  return {
    networkPassphrase: on.passphrase,
    rpcUrl: on.sorobanRpcUrl,
    allowHttp: false,
    publicKey: opts.publicKey,
    signTransaction: opts.signTransaction,
  };
}

/** The addresses for a network, refusing one that has none deployed. */
function contractsOn(opts: ClientOpts): NetworkContracts {
  const on = opts.network ?? fallback;
  if (!on.contracts) {
    throw new Error(
      `Showup is not deployed on ${on.label}, so there is nothing to read there.`,
    );
  }
  return on.contracts;
}

export function factory(opts: ClientOpts = {}) {
  return new FactoryClient({ ...baseOptions(opts), contractId: contractsOn(opts).factoryId });
}

export function event(contractId: string, opts: ClientOpts = {}) {
  return new EventClient({ ...baseOptions(opts), contractId });
}

/**
 * The show-up ledger. One address for every event, unlike `event()`.
 *
 * Reads only, in practice: the app never writes a score. Writes are gated to
 * event contracts the factory deployed, so a score can only ever be the result
 * of someone actually checking in or actually failing to.
 */
export function reputation(opts: ClientOpts = {}) {
  return new ReputationClient({
    ...baseOptions(opts),
    contractId: contractsOn(opts).reputationId,
  });
}

export type { Score };

/** "10.5" -> 105000000n. Rejects more precision than Stellar can hold. */
export function toStroops(xlm: string): bigint {
  const trimmed = xlm.trim();
  if (!/^\d+(\.\d{1,7})?$/.test(trimmed)) {
    throw new Error("Enter an amount with at most 7 decimal places.");
  }
  const [whole, frac = ""] = trimmed.split(".");
  return BigInt(whole) * STROOPS_PER_XLM + BigInt(frac.padEnd(7, "0"));
}

/** 105000000n -> "10.5" */
export function fromStroops(stroops: bigint | string): string {
  const n = typeof stroops === "string" ? BigInt(stroops) : stroops;
  const whole = n / STROOPS_PER_XLM;
  const frac = (n % STROOPS_PER_XLM).toString().padStart(7, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/**
 * The check-in secret the organizer shares as a link/QR.
 *
 * Only its sha256 ever reaches the chain — the secret itself stays off-chain
 * until a guest reveals it by checking in, which is what makes holding it proof
 * of being there.
 */
export function generateSecret(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashSecret(secret: string): Promise<Buffer> {
  // Copy into a plain ArrayBuffer: TextEncoder's view is typed as ArrayBufferLike,
  // which SubtleCrypto's BufferSource won't accept.
  const bytes = secretToBytes(secret);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Buffer.from(new Uint8Array(digest));
}

export function secretToBytes(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export function secretToBuffer(secret: string): Buffer {
  return Buffer.from(secretToBytes(secret));
}

/**
 * Map contract error codes to copy a guest can act on.
 *
 * The message is read with `errMessage` rather than `String(err)`: a call that fails
 * at the signing step throws the wallet kit's plain `{ code, message }` object, and
 * stringifying that yields "[object Object]".
 */
export function friendlyContractError(err: unknown): string {
  const message = errMessage(err);

  // Serves both contracts: 1 and 2 are `AlreadyInitialized` / `NotInitialized` in
  // the factory and in the event alike, and the rest only the event can raise.
  const contractErrors: Record<number, string> = {
    1: "This event has already been set up.",
    2: "This event hasn't been set up yet.",
    3: "The deposit amount is invalid.",
    4: "The capacity is invalid.",
    5: "The fee allowance is invalid.",
    6: "You've already reserved a spot for this event.",
    7: "This event is full.",
    8: "You need to reserve a spot before checking in.",
    9: "You've already checked in.",
    10: "That check-in code isn't right for this event.",
    11: "This event has already been finalized.",
    12: "Reservations closed when the organizer started check-in.",
    13: "Check-in hasn't started yet — the organizer opens it at the event.",
    14: "That's not possible from where this event currently stands.",
    15: "That name is empty or too long.",
    16: "This event needs a start time.",
    // 17 to 23 arrived with on-chain admission. What each of them has in common
    // is that trying again does not help — so none of them may fall through to
    // the "please try again" at the bottom of this function, which is the
    // advice the whole list existed to stop giving.
    17: "This event is only open to people who have shown up before, and your record isn't there yet.",
    18: "The organizer hasn't approved you for this event yet.",
    19: "You've already asked to come to this event.",
    20: "Only the people running this event can do that.",
    21: "That isn't how this event admits people.",
    22: "This event checks attendance records and can't reach the one it was set up with.",
    23: "The organizer who created an event can't be removed from it.",
    // 24 to 27 came with vouching and 28 to 31 with the reclaim and the amount
    // bounds. They were falling through to "please try again" — the one piece
    // of advice this list exists to stop giving, since retrying none of them
    // helps.
    24: "Your record can't carry a vouch yet: it needs a check-in, and no vouch of yours that was broken.",
    25: "You've already vouched for this person at this event.",
    26: "You can't vouch for yourself.",
    27: "This event needs more people to vouch for you before you can reserve.",
    28: "It's too early to take your deposit back — the organizer has 48 hours after the start time to settle.",
    29: "You've already taken your deposit back from this event.",
    30: "Those amounts are too large for this event to hold. Lower the deposit, the fee allowance, or the capacity.",
    31: "This event can't settle: its own numbers don't add up, so it refused rather than pay out the wrong amounts.",
  };

  const match = message.match(/Error\(Contract,\s*#(\d+)\)/);
  if (match) {
    const known = contractErrors[Number(match[1])];
    if (known) return known;
  }
  if (/insufficient|underfunded|balance/i.test(message)) {
    return "Not enough XLM to cover the deposit.";
  }
  if (!message) return "The transaction failed. Please try again.";
  // Whatever is left didn't come from the contract: the call had to be signed to get
  // this far, so the wallet is the other thing that can fail. Its own mapping knows
  // the vocabulary, including the case where backing out isn't a failure at all.
  return readWalletError(err).message ?? "The request was cancelled.";
}
