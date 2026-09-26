import { describe, expect, it } from "vitest";
import {
  EMPTY_RECORD,
  canVouch,
  hasRecord,
  isAccountAddress,
  reservations,
  turnout,
  type Record,
} from "./record";

/**
 * `get_record` answers for every address there is, including ones the ledger has
 * never written a word about. Everything below is a way the page could turn that
 * into a claim about a person that the chain never made.
 */

const of = (over: Partial<Record>): Record => ({ ...EMPTY_RECORD, ...over });

describe("telling an empty record from an absent one", () => {
  it("calls an all-zero record absent, because no writer can produce one", () => {
    // Every writer raises some counter: record_checkin, record_no_show,
    // record_vouch_given, record_vouch_broken, record_organised. `renew` creates
    // nothing. So all-zero is not a record that says nothing — it is no record.
    expect(hasRecord(EMPTY_RECORD)).toBe(false);
  });

  it("calls a record present on the strength of any single counter", () => {
    // Including the three that are not attendance. A wallet that has only ever
    // vouched for somebody, or only ever run an event, is known to the ledger —
    // and a check that looked at shows and no_shows alone would call it a
    // stranger and offer it a newcomer's empty state.
    for (const field of [
      "shows",
      "noShows",
      "vouchesGiven",
      "vouchesBroken",
      "eventsOrganised",
    ] as const) {
      expect(hasRecord(of({ [field]: 1 })), field).toBe(true);
    }
  });
});

describe("turnout", () => {
  it("has none at all when nothing was ever reserved", () => {
    // Not 0%. 0% reads as "never turns up", which would libel every wallet that
    // has simply never booked anything.
    expect(turnout(EMPTY_RECORD)).toBeNull();
    expect(turnout(of({ vouchesGiven: 3 }))).toBeNull();
  });

  it("counts a no-show against the rate and a vouch not at all", () => {
    expect(turnout(of({ shows: 3, noShows: 1 }))).toBe(75);
    expect(reservations(of({ shows: 3, noShows: 1 }))).toBe(4);
    // Vouches are not reservations, so they must not move the denominator.
    expect(turnout(of({ shows: 3, noShows: 1, vouchesGiven: 9 }))).toBe(75);
  });

  it("is 100 for somebody who has always turned up, and 0 for somebody who never has", () => {
    expect(turnout(of({ shows: 2 }))).toBe(100);
    // Here 0 is the real answer: they reserved and did not come.
    expect(turnout(of({ noShows: 2 }))).toBe(0);
  });
});

describe("whether a wallet may vouch, by the contract's rule", () => {
  it("needs a show, so a second wallet cannot wave itself through", () => {
    expect(canVouch(EMPTY_RECORD)).toBe(false);
    expect(canVouch(of({ shows: 1 }))).toBe(true);
  });

  it("stays closed forever after one broken vouch, at any show count", () => {
    // The rule is not a threshold. If it were, somebody could buy back the right
    // to keep waving strangers in by attending a lot of their own events — and
    // this page would promise an organizer a vouch the contract will refuse.
    expect(canVouch(of({ shows: 50, vouchesBroken: 1 }))).toBe(false);
    expect(canVouch(of({ shows: 1, vouchesGiven: 9, vouchesBroken: 0 }))).toBe(true);
  });

  it("is unmoved by no-shows of the member's own", () => {
    // Missing your own event and backing somebody who missed theirs are separate
    // failures with separate counters, and only the second closes vouching.
    expect(canVouch(of({ shows: 1, noShows: 40 }))).toBe(true);
  });
});

describe("what counts as a wallet address", () => {
  const G = "GBQRAWAAWGSS2G5G4BWAN3XJBGGEXYDJM66S7Z6TPULGLEDC7RE2O4PW";

  it("takes a 56-character account address and nothing else", () => {
    expect(isAccountAddress(G)).toBe(true);
    expect(isAccountAddress(G.slice(0, 55))).toBe(false);
    expect(isAccountAddress(`${G}X`)).toBe(false);
    expect(isAccountAddress(G.toLowerCase())).toBe(false);
  });

  it("refuses a contract address, which is not a person", () => {
    // An event contract has a registration on this ledger but never a score, so
    // a `C…` here would render a newcomer's empty state for something that is
    // not a member at all.
    expect(isAccountAddress("CDFGVEIJDNCTGN2F6VN47QFDWTGTKJMBNBEETAWGZ5RV7GDYPEOLA3DJ")).toBe(
      false,
    );
  });

  it("refuses the characters base32 does not have", () => {
    // 0, 1, 8 and 9 are not in Stellar's alphabet, so an address containing one
    // was mistyped or truncated rather than merely unknown.
    expect(isAccountAddress(`G0${G.slice(2)}`)).toBe(false);
    expect(isAccountAddress(`G1${G.slice(2)}`)).toBe(false);
  });
});
