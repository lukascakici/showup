import {
  Client as FactoryClient,
  networks as factoryNetworks,
  type ForfeitPolicy,
} from "factory-client";
import { Client as EventClient } from "event-client";
import { NETWORK_PASSPHRASE, errMessage, type SignFn } from "./stellar";
import { readWalletError } from "./wallet-errors";

export const SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";
export const FACTORY_ID = factoryNetworks.testnet.contractId;

/** The Stellar Asset Contract for native XLM on Testnet. */
export const NATIVE_SAC = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

export const STROOPS_PER_XLM = 10_000_000n;

/** What each guest is reimbursed on check-in, to cover the fees they spent. */
export const FEE_ALLOWANCE_STROOPS = 1_000_000n; // 0.1 XLM

export type { ForfeitPolicy };

type ClientOpts = {
  publicKey?: string;
  signTransaction?: SignFn;
};

function baseOptions(opts: ClientOpts) {
  return {
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: SOROBAN_RPC_URL,
    allowHttp: false,
    publicKey: opts.publicKey,
    signTransaction: opts.signTransaction,
  };
}

export function factory(opts: ClientOpts = {}) {
  return new FactoryClient({ ...baseOptions(opts), contractId: FACTORY_ID });
}

export function event(contractId: string, opts: ClientOpts = {}) {
  return new EventClient({ ...baseOptions(opts), contractId });
}

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
