import { Horizon, Networks } from "@stellar/stellar-sdk";
import {
  defaultNetwork,
  EXPLORER_ACCOUNT as explorerAccount,
  EXPLORER_CONTRACT as explorerContract,
  EXPLORER_TX as explorerTx,
} from "./networks";

/**
 * The default network's values, for the callers that have not been given one.
 *
 * These used to be the only network there was. They are now a view onto
 * `networks.ts`, which is the single place anything network-shaped is defined —
 * so these exports keep working while callers are moved over one at a time, and
 * none of them can drift away from the registry in the meantime.
 *
 * A caller that handles an event, a wallet or a transaction should take its
 * network as an argument instead: once both networks are live, "the default
 * network" is the wrong question to ask about something that belongs to one of
 * them.
 */
const fallback = defaultNetwork();

export const NETWORK_PASSPHRASE = fallback.passphrase;
export const HORIZON_URL = fallback.horizonUrl;
export const EXPLORER_TX = (hash: string) => explorerTx(fallback, hash);
export const EXPLORER_ACCOUNT = (id: string) => explorerAccount(fallback, id);
export const EXPLORER_CONTRACT = (id: string) => explorerContract(fallback, id);

export const horizon = new Horizon.Server(HORIZON_URL);

/**
 * A network's name, for telling someone which one their wallet is on.
 *
 * The passphrase is what a wallet actually reports, and it is a sentence — the
 * public network's is "Public Global Stellar Network ; September 2015". Showing
 * that verbatim to someone whose wallet is simply on the wrong setting explains
 * nothing about which setting to change.
 */
export function networkName(passphrase: string | null): string {
  if (!passphrase) return "another network";
  if (passphrase === Networks.PUBLIC) return "Mainnet";
  if (passphrase === Networks.TESTNET) return "Testnet";
  if (passphrase === Networks.FUTURENET) return "Futurenet";
  if (passphrase === Networks.STANDALONE) return "a local network";
  return "another network";
}

export type AccountState = {
  funded: boolean;
  xlm: string; // human string, e.g. "9999.9999900"
};

/** Fetch the native XLM balance. Unfunded accounts return { funded: false }. */
export async function fetchAccountState(address: string): Promise<AccountState> {
  try {
    const account = await horizon.loadAccount(address);
    const native = account.balances.find(
      (b) => b.asset_type === "native",
    );
    return { funded: true, xlm: native?.balance ?? "0" };
  } catch (err: unknown) {
    if (isNotFound(err)) return { funded: false, xlm: "0" };
    throw err;
  }
}

export type FaucetResult = "funded" | "already_funded";

/**
 * Fund an account via Friendbot on a network that has one.
 *
 * Only Testnet does. The guard is not defensive housekeeping: a faucet button
 * that appeared to work on Mainnet, or failed there with a network error, would
 * both be worse than the button not being there — so the absence of a faucet is
 * a fact callers have to read off the network rather than assume away.
 */
export async function fundWithFriendbot(
  address: string,
  on: { friendbotUrl: string | null; label: string } = fallback,
): Promise<FaucetResult> {
  if (!on.friendbotUrl) {
    throw new Error(`${on.label} has no faucet. Accounts there are funded with real XLM.`);
  }
  const res = await fetch(`${on.friendbotUrl}/?addr=${encodeURIComponent(address)}`);
  if (res.ok) return "funded";
  const body = await res.text();
  if (
    res.status === 400 &&
    /already.*funded|op_already_exists|createAccountAlreadyExist|already exists/i.test(body)
  ) {
    return "already_funded";
  }
  throw new Error(`Friendbot funding failed (${res.status})`);
}

/**
 * Sign an XDR with the connected wallet.
 *
 * Shaped to match both the wallet kit's `signTransaction` and the signing hook
 * the generated contract clients accept, so it can be handed to either without
 * an adapter. Rejection is a thrown error, never a returned field.
 */
export type SignFn = (
  xdr: string,
  opts?: { networkPassphrase?: string; address?: string },
) => Promise<{ signedTxXdr: string; signerAddress?: string }>;

function isNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { response?: { status?: number }; message?: string };
  return e.response?.status === 404 || /not found/i.test(e.message ?? "");
}

export function errMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message?: unknown }).message ?? "");
  }
  return "";
}
