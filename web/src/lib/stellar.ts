import {
  Asset,
  BASE_FEE,
  Horizon,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

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

/** Fund an account on Testnet via Friendbot. Idempotent-ish; throws on hard failure. */
export async function fundWithFriendbot(address: string): Promise<void> {
  const res = await fetch(`${FRIENDBOT_URL}/?addr=${encodeURIComponent(address)}`);
  if (!res.ok) {
    // 400 = "account already funded" is common and harmless
    const body = await res.text();
    if (res.status === 400 && body.includes("already funded")) return;
    throw new Error(`Friendbot funding failed (${res.status})`);
  }
}

export type SignFn = (
  xdr: string,
  opts: { networkPassphrase: string; address: string },
) => Promise<{ signedTxXdr: string; error?: string | { message?: string } }>;

/**
 * Build → sign (via wallet) → submit a native XLM payment.
 * Returns the transaction hash on success.
 */
export async function sendPayment(params: {
  from: string;
  to: string;
  amount: string;
  memo?: string;
  sign: SignFn;
}): Promise<string> {
  const { from, to, amount, sign } = params;
  const source = await horizon.loadAccount(from);

  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: to,
        asset: Asset.native(),
        amount,
      }),
    )
    .setTimeout(120)
    .build();

  const signed = await sign(tx.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
    address: from,
  });

  if (signed.error) {
    throw new Error(errMessage(signed.error) || "Signing was rejected");
  }

  const signedTx = TransactionBuilder.fromXDR(
    signed.signedTxXdr,
    NETWORK_PASSPHRASE,
  );
  const result = await horizon.submitTransaction(signedTx);
  return result.hash;
}

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

/** Map common Horizon submit errors to friendly copy. */
export function friendlyTxError(err: unknown): string {
  const anyErr = err as {
    response?: { data?: { extras?: { result_codes?: Record<string, unknown> } } };
    message?: string;
  };
  const codes = anyErr?.response?.data?.extras?.result_codes;
  if (codes) {
    const ops = JSON.stringify(codes);
    if (ops.includes("op_underfunded")) return "Not enough XLM to cover this payment.";
    if (ops.includes("op_no_destination"))
      return "Destination account doesn't exist yet. It must be funded first.";
    if (ops.includes("tx_bad_seq")) return "Sequence out of date — please retry.";
    if (ops.includes("tx_insufficient_fee")) return "Network fee too low — please retry.";
  }
  return errMessage(err) || "Transaction failed. Please try again.";
}
