import { toStroops } from "./contracts";
import type { AccountState } from "./stellar";

/**
 * Can this account actually pay the deposit?
 *
 * Asked *before* the wallet prompt, because the alternative is what the app did
 * until now: let someone sign, let the transaction fail, and hand back a
 * contract error. Someone who has never used Stellar reads that as "the site is
 * broken", and next week ten of them are doing this unattended.
 *
 * Two amounts are held back from the balance on purpose:
 *
 * - **The base reserve.** Stellar locks 1 XLM in every account permanently. It
 *   is in the balance Horizon reports and it can never be spent, so counting it
 *   as available is how you get an account that "has enough" and still fails.
 * - **Fee headroom.** The reservation is a Soroban invocation, so it costs an
 *   inclusion fee plus resource fees. 0.5 XLM is far more than a Testnet
 *   reservation has ever cost and cheap to be wrong about in this direction.
 */
export const BASE_RESERVE_STROOPS = 10_000_000n; // 1 XLM
export const FEE_HEADROOM_STROOPS = 5_000_000n; // 0.5 XLM

export type Funding =
  /** No answer yet, or one we couldn't read. Never a reason to block anybody. */
  | { kind: "unknown" }
  /** The account doesn't exist on the ledger. Friendbot creates it. */
  | { kind: "unfunded" }
  | { kind: "short"; need: bigint; have: bigint; missing: bigint }
  | { kind: "ok" };

export function fundingFor(balance: AccountState | null, deposit: bigint): Funding {
  if (!balance) return { kind: "unknown" };
  if (!balance.funded) return { kind: "unfunded" };

  let have: bigint;
  try {
    have = toStroops(balance.xlm);
  } catch {
    // Horizon gives seven decimals, so this shouldn't happen — and if it does,
    // an unreadable balance is not evidence that someone can't afford anything.
    return { kind: "unknown" };
  }

  const need = deposit + BASE_RESERVE_STROOPS + FEE_HEADROOM_STROOPS;
  if (have < need) return { kind: "short", need, have, missing: need - have };
  return { kind: "ok" };
}

/** True only when we have a definite answer and the answer is no. */
export function blocksReservation(funding: Funding): boolean {
  return funding.kind === "unfunded" || funding.kind === "short";
}
