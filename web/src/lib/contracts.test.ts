import { describe, expect, it } from "vitest";
import { friendlyContractError, fromStroops, toStroops } from "./contracts";

describe("toStroops", () => {
  it("converts XLM to stroops at full ledger precision", () => {
    expect(toStroops("1")).toBe(10_000_000n);
    expect(toStroops("10.5")).toBe(105_000_000n);
    expect(toStroops("0.0000001")).toBe(1n);
    expect(toStroops(" 10 ")).toBe(100_000_000n);
  });

  it("rejects more precision than a stroop can hold", () => {
    expect(() => toStroops("10.12345678")).toThrow(/7 decimal places/);
  });

  it("rejects anything that isn't a positive decimal", () => {
    expect(() => toStroops("-1")).toThrow();
    expect(() => toStroops("abc")).toThrow();
    expect(() => toStroops("")).toThrow();
    expect(() => toStroops("1.")).toThrow();
  });
});

describe("fromStroops", () => {
  it("renders stroops back as XLM without trailing zeros", () => {
    expect(fromStroops(105_000_000n)).toBe("10.5");
    expect(fromStroops(10_000_000n)).toBe("1");
    expect(fromStroops(12_300_000n)).toBe("1.23");
    expect(fromStroops(0n)).toBe("0");
    expect(fromStroops(1n)).toBe("0.0000001");
    expect(fromStroops(10_000_001n)).toBe("1.0000001");
  });

  it("accepts the string form the bindings hand back", () => {
    expect(fromStroops("105000000")).toBe("10.5");
  });

  it("round-trips with toStroops", () => {
    for (const amount of ["1", "10.5", "0.0000001", "9999.9999999"]) {
      expect(fromStroops(toStroops(amount))).toBe(amount);
    }
  });
});

describe("friendlyContractError", () => {
  it("maps each event contract error code to copy a guest can act on", () => {
    const cases: Array<[number, string]> = [
      [6, "You've already reserved a spot for this event."],
      [7, "This event is full."],
      [8, "You need to reserve a spot before checking in."],
      [9, "You've already checked in."],
      [10, "That check-in code isn't right for this event."],
      [11, "This event has already been finalized."],
      [12, "Reservations closed when the organizer started check-in."],
      [13, "Check-in hasn't started yet — the organizer opens it at the event."],
    ];
    for (const [code, expected] of cases) {
      const err = new Error(`HostError: Error(Contract, #${code})`);
      expect(friendlyContractError(err)).toBe(expected);
    }
  });

  it("reads the wallet kit's plain object, which is not an Error", () => {
    // The kit builds every failure as { code, message } rather than throwing an
    // Error, so reading this with String(err) would print "[object Object]" — and a
    // signing rejection reaches here, because a contract call has to be signed.
    expect(friendlyContractError({ code: -4, message: "User declined access" })).toBe(
      "You rejected the request in your wallet.",
    );
    expect(
      friendlyContractError({ code: -1, message: "HostError: Error(Contract, #7)" }),
    ).toBe("This event is full.");
  });

  it("maps the two setup errors the factory can hit", () => {
    expect(friendlyContractError(new Error("Error(Contract, #1)"))).toBe(
      "This event has already been set up.",
    );
    expect(friendlyContractError(new Error("Error(Contract, #2)"))).toBe(
      "This event hasn't been set up yet.",
    );
  });

  it("recognises a rejection or an empty balance from the message alone", () => {
    expect(friendlyContractError(new Error("insufficient funds"))).toBe(
      "Not enough XLM to cover the deposit.",
    );
    expect(friendlyContractError(new Error("User declined the request"))).toBe(
      "You rejected the request in your wallet.",
    );
  });

  it("passes an unmapped failure through rather than inventing a reason", () => {
    expect(friendlyContractError(new Error("simulation failed"))).toBe("simulation failed");
    expect(friendlyContractError(new Error(""))).toBe("The transaction failed. Please try again.");
  });
});
