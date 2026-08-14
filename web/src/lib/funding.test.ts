import { describe, expect, it } from "vitest";
import {
  BASE_RESERVE_STROOPS,
  FEE_HEADROOM_STROOPS,
  blocksReservation,
  fundingFor,
} from "./funding";
import { toStroops } from "./contracts";

const TEN_XLM = toStroops("10");

describe("fundingFor", () => {
  it("says nothing when the balance hasn't loaded", () => {
    expect(fundingFor(null, TEN_XLM)).toEqual({ kind: "unknown" });
  });

  it("reports an account that doesn't exist yet", () => {
    expect(fundingFor({ funded: false, xlm: "0" }, TEN_XLM)).toEqual({ kind: "unfunded" });
  });

  it("passes an account that Friendbot has funded", () => {
    expect(fundingFor({ funded: true, xlm: "10000" }, TEN_XLM)).toEqual({ kind: "ok" });
  });

  // The whole reason this module exists: the balance says 10, the deposit is 10,
  // and the reservation still fails because 1 XLM is locked and the fees are real.
  it("blocks a balance that only just covers the deposit", () => {
    const funding = fundingFor({ funded: true, xlm: "10" }, TEN_XLM);
    expect(funding.kind).toBe("short");
    if (funding.kind !== "short") return;
    expect(funding.need).toBe(TEN_XLM + BASE_RESERVE_STROOPS + FEE_HEADROOM_STROOPS);
    expect(funding.have).toBe(TEN_XLM);
    expect(funding.missing).toBe(BASE_RESERVE_STROOPS + FEE_HEADROOM_STROOPS);
  });

  it("passes at exactly the deposit plus the reserve and the headroom", () => {
    const enough = TEN_XLM + BASE_RESERVE_STROOPS + FEE_HEADROOM_STROOPS;
    expect(fundingFor({ funded: true, xlm: "11.5" }, TEN_XLM).kind).toBe("ok");
    expect(enough).toBe(toStroops("11.5"));
  });

  it("is one stroop away from ok at one stroop short", () => {
    const funding = fundingFor({ funded: true, xlm: "11.4999999" }, TEN_XLM);
    expect(funding.kind).toBe("short");
    if (funding.kind !== "short") return;
    expect(funding.missing).toBe(1n);
  });

  it("treats an unreadable balance as no answer rather than as a refusal", () => {
    expect(fundingFor({ funded: true, xlm: "not a number" }, TEN_XLM)).toEqual({
      kind: "unknown",
    });
  });
});

describe("blocksReservation", () => {
  // "We don't know" must never stop anyone: Horizon being down is not the same
  // fact as an empty account, and only one of them is the user's problem.
  it("never blocks on an unknown answer", () => {
    expect(blocksReservation({ kind: "unknown" })).toBe(false);
  });

  it("blocks only on a definite no", () => {
    expect(blocksReservation({ kind: "unfunded" })).toBe(true);
    expect(blocksReservation({ kind: "ok" })).toBe(false);
    expect(
      blocksReservation({ kind: "short", need: 1n, have: 0n, missing: 1n }),
    ).toBe(true);
  });
});
