import { Horizon, Networks } from "@stellar/stellar-sdk";

export const NETWORK = "TESTNET" as const;
export const NETWORK_PASSPHRASE = Networks.TESTNET;
export const HORIZON_URL = "https://horizon-testnet.stellar.org";
export const FRIENDBOT_URL = "https://friendbot.stellar.org";
export const EXPLORER_TX = (hash: string) =>
  `https://stellar.expert/explorer/testnet/tx/${hash}`;
export const EXPLORER_ACCOUNT = (id: string) =>
  `https://stellar.expert/explorer/testnet/account/${id}`;

export const horizon = new Horizon.Server(HORIZON_URL);

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
 * Fund an account on Testnet via Friendbot.
 * Returns "funded" when it created/funded the account, or "already_funded" when
 * the account already exists (Friendbot only funds a new account once).
 */
export async function fundWithFriendbot(address: string): Promise<FaucetResult> {
  const res = await fetch(`${FRIENDBOT_URL}/?addr=${encodeURIComponent(address)}`);
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
