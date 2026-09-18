import { describe, expect, it } from "vitest";
import {
  FACTORY_ID,
  REPUTATION_ID,
  event,
  friendlyContractError,
  fromStroops,
  toStroops,
} from "./contracts";

describe("deployed contract addresses", () => {
  // These read as tautologies and are not. Both constants come out of generated
  // bindings, and the generator is happy to regenerate a package against a
  // stale contract, the wrong network, or a local wasm with no address at all —
  // each of which produces code that compiles, type-checks and points at the
  // wrong chain state. Pinning them here means a regeneration that silently
  // moved an address fails the build instead of the event list.
  //
  // Expected values live in docs/deployments.md. Changing one is a deliberate
  // edit in two places, which is the point.
  it("match the v2 deployment recorded in docs/deployments.md", () => {
    expect(FACTORY_ID).toBe("CD5AEMRB35FBZKO24562DRITAY337CMBXGF6HVSUDRKWHE4RKQLE7FCE");
    expect(REPUTATION_ID).toBe("CDFGVEIJDNCTGN2F6VN47QFDWTGTKJMBNBEETAWGZ5RV7GDYPEOLA3DJ");
  });

  it("are Soroban contract addresses, not accounts", () => {
    // A G… address here would mean a networks block was hand-edited with a
    // wallet address, which the SDK only rejects at call time.
    for (const id of [FACTORY_ID, REPUTATION_ID]) {
      expect(id).toMatch(/^C[A-Z2-7]{55}$/);
    }
  });
});

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

describe("the committed event binding against a live, pre-SOW2 event", () => {
  // Captured from CAOK5LME…EWMUTLJL ("coffee time") on Testnet, which was
  // deployed from the first event revision and holds a ten-field Config.
  //
  // This is the regression test for a real outage: adding `admission` and
  // `hosts` to `Config` made `get_config` throw `vec not set` against every
  // event on the live factory, because those events will never have the fields —
  // they run the wasm they were deployed from, and a stored struct does not
  // gain members when a newer revision ships. The page could not load at all.
  //
  // So `Config` is frozen. Anything added to an event after the first revision
  // is keyed separately and read through `get_terms`, which an old event simply
  // does not answer. If a future field lands in `Config` instead, this fails
  // offline and immediately, rather than on somebody's phone.
  const LIVE_CONFIG_XDR =
    "AAAAEQAAAAEAAAAKAAAADwAAAAhjYXBhY2l0eQAAAAMAAAAUAAAADwAAAAljb2RlX2hhc2gAAAAAAAANAAAAIN8ChZhKx7iC8Og8KZ00ysLUMEQaZ5BYOD61SVRDFxKiAAAADwAAAAdkZXBvc2l0AAAAAAoAAAAAAAAAAAAAAAAC+vCAAAAADwAAAA1mZWVfYWxsb3dhbmNlAAAAAAAACgAAAAAAAAAAAAAAAAAPQkAAAAAPAAAACW9yZ2FuaXplcgAAAAAAABIAAAAAAAAAAGEQWACxpS0bpuBsBu7pCYxL4GlnvS/n030WZZBi/EmnAAAADwAAAAZwb2xpY3kAAAAAABAAAAABAAAAAQAAAA8AAAATU3BsaXRBbW9uZ0F0dGVuZGVlcwAAAAAPAAAACnJlcHV0YXRpb24AAAAAABIAAAABymqRCRtFMzdF9VvPwKO0zTUlgWhISYLGz2NfmHh5HLAAAAAPAAAACXN0YXJ0c19hdAAAAAAAAAUAAAAAapB7IAAAAA8AAAAFdGl0bGUAAAAAAAAOAAAAC2NvZmZlZSB0aW1lAAAAAA8AAAAFdG9rZW4AAAAAAAASAAAAAdeSi3LCcDzP6vfrn/TvTVBKVai5efybRQ6iyEK00c5h";

  it("still decodes a Config written by the first revision", () => {
    const client = event("CAOK5LMEBEFHYWXLD5D55U46E73FD5ZTTBBBMMQIBMLYXTZWEWMUTLJL");
    // `get_config` returns a Result, so the spec hands back a wrapper.
    const decoded = (
      client.spec.funcResToNative("get_config", LIVE_CONFIG_XDR) as {
        unwrap: () => { title: string; capacity: number; organizer: string };
      }
    ).unwrap();

    expect(decoded.title).toBe("coffee time");
    expect(decoded.capacity).toBe(20);
    expect(decoded.organizer).toBe("GBQRAWAAWGSS2G5G4BWAN3XJBGGEXYDJM66S7Z6TPULGLEDC7RE2O4PW");
  });

  it("has no field in Config that a pre-SOW2 event could not have written", () => {
    const client = event("CAOK5LMEBEFHYWXLD5D55U46E73FD5ZTTBBBMMQIBMLYXTZWEWMUTLJL");
    const struct = client.spec.findEntry("Config").value() as {
      fields: () => { name: () => Buffer | string }[];
    };
    const fields = struct.fields().map((f) => f.name().toString());

    expect([...fields].sort()).toEqual([
      "capacity",
      "code_hash",
      "deposit",
      "fee_allowance",
      "organizer",
      "policy",
      "reputation",
      "starts_at",
      "title",
      "token",
    ]);
  });
});
