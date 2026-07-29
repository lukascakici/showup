import { describe, expect, it } from "vitest";
import { errMessage, friendlyTxError } from "./stellar";

/** Shape a Horizon submit failure the way the SDK hands it to us. */
function horizonError(result_codes: Record<string, unknown>, message?: string) {
  return { response: { data: { extras: { result_codes } } }, message };
}

describe("errMessage", () => {
  it("unwraps the shapes wallets and the SDK actually throw", () => {
    expect(errMessage("boom")).toBe("boom");
    expect(errMessage(new Error("boom"))).toBe("boom");
    expect(errMessage({ message: "boom" })).toBe("boom");
  });

  it("reads the message off a plain wallet error object", () => {
    // StellarWalletsKit rejects with a plain { code, message } literal rather
    // than an Error, so duck-typing the message is what keeps that readable.
    expect(errMessage({ code: -4, message: "The user rejected this request." })).toBe(
      "The user rejected this request.",
    );
  });

  it("returns an empty string for anything without a message", () => {
    expect(errMessage(null)).toBe("");
    expect(errMessage(undefined)).toBe("");
    expect(errMessage(42)).toBe("");
    expect(errMessage({ message: undefined })).toBe("");
  });
});

describe("friendlyTxError", () => {
  it("explains the Horizon result codes a sender can act on", () => {
    expect(friendlyTxError(horizonError({ operations: ["op_underfunded"] }))).toBe(
      "Not enough XLM to cover this payment.",
    );
    expect(friendlyTxError(horizonError({ operations: ["op_no_destination"] }))).toBe(
      "Destination account doesn't exist yet. It must be funded first.",
    );
    expect(friendlyTxError(horizonError({ transaction: "tx_bad_seq" }))).toBe(
      "Sequence out of date — please retry.",
    );
    expect(friendlyTxError(horizonError({ transaction: "tx_insufficient_fee" }))).toBe(
      "Network fee too low — please retry.",
    );
  });

  it("falls back to the underlying message, then to generic copy", () => {
    expect(friendlyTxError(horizonError({ transaction: "tx_failed" }, "went wrong"))).toBe(
      "went wrong",
    );
    expect(friendlyTxError(horizonError({ transaction: "tx_failed" }))).toBe(
      "Transaction failed. Please try again.",
    );
    expect(friendlyTxError(new Error("network down"))).toBe("network down");
    expect(friendlyTxError({})).toBe("Transaction failed. Please try again.");
  });
});
