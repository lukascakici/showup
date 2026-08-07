import { describe, expect, it } from "vitest";
import { errMessage } from "./stellar";

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
