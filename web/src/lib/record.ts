import { reputation } from "./contracts";

/**
 * A wallet's whole standing on the show-up ledger, and what it means.
 *
 * The contract's `get_record` answers for any address at all, because it
 * assembles its reply from two storage entries that a member is allowed not to
 * have. So "this wallet has never done anything" and "this wallet's record says
 * nothing" come back identical, and the page has to be able to tell them apart
 * before it writes a single number down. See `hasRecord`.
 */
export type Record = {
  shows: number;
  noShows: number;
  vouchesGiven: number;
  vouchesBroken: number;
  eventsOrganised: number;
};

export const EMPTY_RECORD: Record = {
  shows: 0,
  noShows: 0,
  vouchesGiven: 0,
  vouchesBroken: 0,
  eventsOrganised: 0,
};

/** A Stellar account address. Contract addresses start with `C` and are not people. */
export function isAccountAddress(value: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(value);
}

/**
 * Whether the ledger has ever written anything about this wallet.
 *
 * Every writer the contract has raises some counter: `record_checkin` raises
 * `shows`, `record_no_show` raises `no_shows`, `record_vouch_given` and
 * `record_vouch_broken` raise theirs, `record_organised` raises
 * `events_organised`. None of them can produce a stored record that is all
 * zeroes, and `renew` deliberately creates nothing at all.
 *
 * So all-zeroes means *unwritten*, provably rather than probably — which is what
 * lets this page say "the ledger has never seen this wallet" instead of printing
 * five zeroes as though the chain had asserted them. Those are very different
 * claims to make about somebody an organizer is deciding whether to admit.
 */
export function hasRecord(r: Record): boolean {
  return (
    r.shows > 0 ||
    r.noShows > 0 ||
    r.vouchesGiven > 0 ||
    r.vouchesBroken > 0 ||
    r.eventsOrganised > 0
  );
}

/** Reservations this wallet has held, whether or not it turned up for them. */
export function reservations(r: Record): number {
  return r.shows + r.noShows;
}

/**
 * Turnout as a percentage, or `null` when there is nothing to divide.
 *
 * A wallet with no reservations has no turnout rate — not 0%, which reads as
 * "never shows up" and would libel every newcomer on the ledger.
 */
export function turnout(r: Record): number | null {
  const total = reservations(r);
  if (total === 0) return null;
  return (r.shows / total) * 100;
}

/**
 * Whether this wallet may vouch somebody else in, by the contract's own rule.
 *
 * Mirrors `require_can_vouch` in `contracts/event/src/lib.rs`: at least one show
 * **and** no broken vouches. The second half is the part worth surfacing, since
 * it is the one that does not follow from the numbers looking good — a member with
 * fifty shows and one broken vouch is refused, and an organizer reading this page
 * to decide whether to run a vouch-gated event deserves to know that before they
 * find out from a failed transaction.
 */
export function canVouch(r: Record): boolean {
  return r.shows >= 1 && r.vouchesBroken === 0;
}

/**
 * Read a wallet's record off the chain.
 *
 * Not wrapped in a `try_`-equivalent and deliberately allowed to throw: a record
 * this page cannot read has no safe default. Rendering `EMPTY_RECORD` on an RPC
 * failure would turn "we couldn't ask" into "this person has never shown up",
 * which is the one wrong answer that does damage.
 */
export async function loadRecord(member: string): Promise<Record> {
  const tx = await reputation().get_record({ member });
  const r = tx.result;
  return {
    shows: Number(r.shows),
    noShows: Number(r.no_shows),
    vouchesGiven: Number(r.vouches_given),
    vouchesBroken: Number(r.vouches_broken),
    eventsOrganised: Number(r.events_organised),
  };
}
