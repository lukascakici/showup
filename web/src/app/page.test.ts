import { describe, expect, it } from "vitest";
import type { ListedEvent } from "@/lib/events";
import { summarise } from "./page";

/**
 * The home page's headline figures are a claim about money, made to strangers.
 *
 * Every number the hero prints is derived here: how many people reserved, how
 * many turned up, what came back at the door and what the no-shows left behind.
 * Getting one of them wrong does not crash anything and does not look wrong on
 * screen; it just publishes a false figure about somebody's deposit.
 */
function event(over: Partial<ListedEvent> = {}): ListedEvent {
  return {
    id: "C".padEnd(56, "A"),
    title: "Test",
    startsAt: 1_700_000_000,
    organizer: "G".padEnd(56, "A"),
    hosts: [],
    deposit: 50_000_000n,
    feeAllowance: 1_000_000n,
    capacity: 20,
    policy: { tag: "ToOrganizer", values: undefined } as ListedEvent["policy"],
    reserved: [],
    checkedIn: [],
    phase: "Finalized",
    source: "chain",
    ...over,
  };
}

const guests = (n: number) => Array.from({ length: n }, (_, i) => `G${i}`);

describe("the turnout figures", () => {
  it("counts the events that have actually settled", () => {
    const s = summarise([
      event({ reserved: guests(12), checkedIn: guests(11) }),
      event({ reserved: guests(2), checkedIn: guests(1), deposit: 100_000_000n }),
    ]);
    expect(s.reserved).toBe(14);
    expect(s.showed).toBe(12);
    expect(s.rate).toBeCloseTo((12 / 14) * 100, 5);
  });

  it("returns the fee allowance along with the deposit", () => {
    // Check-in transfers deposit + fee_allowance in one go, so quoting the
    // deposit alone would understate every refund the contract has ever made.
    const s = summarise([event({ reserved: guests(2), checkedIn: guests(2) })]);
    expect(s.returned).toBe(2n * (50_000_000n + 1_000_000n));
  });

  it("forfeits the deposit only, never the fee allowance", () => {
    // The unspent fee pool goes back to the organizer at finalize. It was never
    // the no-show's to lose, so counting it as forfeited would inflate the
    // figure with somebody else's money.
    const s = summarise([event({ reserved: guests(3), checkedIn: guests(1) })]);
    expect(s.forfeited).toBe(2n * 50_000_000n);
  });

  it("ignores an event that is still running", () => {
    // A no-show in an event still checking in may yet walk through the door.
    // Counting their deposit as forfeited states an outcome the chain has not
    // reached, and the page would have to take it back afterwards.
    const s = summarise([
      event({ phase: "Reserving", reserved: guests(9) }),
      event({ phase: "CheckingIn", reserved: guests(5), checkedIn: guests(1) }),
    ]);
    expect(s).toEqual({ reserved: 0, showed: 0, rate: null, returned: 0n, forfeited: 0n });
  });

  it("has no rate at all before anything settles, rather than zero", () => {
    // 0% reads as a product that does not work. `null` is the page's cue to say
    // nothing has settled yet, which is the true statement.
    expect(summarise([]).rate).toBeNull();
    expect(summarise(undefined).rate).toBeNull();
    expect(summarise([event({ reserved: [], checkedIn: [] })]).rate).toBeNull();
  });

  it("says 100 percent when everybody came, and forfeits nothing", () => {
    const s = summarise([event({ reserved: guests(4), checkedIn: guests(4) })]);
    expect(s.rate).toBe(100);
    expect(s.forfeited).toBe(0n);
  });
});
