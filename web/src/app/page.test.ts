import { describe, expect, it } from "vitest";
import type { ListedEvent } from "@/lib/events";
import { summarise } from "./page";

/**
 * The home page's headline is a claim about other people's events, made to
 * strangers, and this is where the measured half of it comes from.
 *
 * The hero puts a rule of thumb next to a counted figure. The rule of thumb is
 * honest because it is labelled; the counted figure is only honest if it is
 * actually counted right. Getting it wrong crashes nothing and looks like
 * nothing on screen, it just overstates how well the product works.
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

  it("ignores an event that is still running", () => {
    // A no-show in an event still checking in may yet walk through the door.
    // Scoring them now publishes an outcome the chain has not reached, and the
    // page would have to take it back afterwards.
    const s = summarise([
      event({ phase: "Reserving", reserved: guests(9) }),
      event({ phase: "CheckingIn", reserved: guests(5), checkedIn: guests(1) }),
    ]);
    expect(s).toEqual({ reserved: 0, showed: 0, rate: null });
  });

  it("has no rate at all before anything settles, rather than zero", () => {
    // 0% reads as a product that does not work. `null` is the page's cue to say
    // nothing has settled yet, which is the true statement.
    expect(summarise([]).rate).toBeNull();
    expect(summarise(undefined).rate).toBeNull();
    expect(summarise([event({ reserved: [], checkedIn: [] })]).rate).toBeNull();
  });

  it("says 100 percent when everybody came", () => {
    const s = summarise([event({ reserved: guests(4), checkedIn: guests(4) })]);
    expect(s.rate).toBe(100);
  });
});
