import { describe, expect, it } from "vitest";
import { friendlyWalletError, readWalletError } from "./wallet-errors";

/**
 * Every literal below is copied out of the shipped packages, not paraphrased:
 * the kit's `sdk/kit.js` and its four wallet modules, `@albedo-link/intent`,
 * `@creit.tech/xbull-wallet-connect` and rxjs. They are the contract this mapping
 * is written against, so a wrong guess here would be a wrong guess in production.
 */
describe("readWalletError", () => {
  it("reads a rejection from the code Albedo and Freighter share", () => {
    // Albedo's own table: { message: "Action request was rejected by the user.", code: -4 }
    expect(friendlyWalletError({ code: -4, message: "Action request was rejected by the user." }))
      .toBe("You rejected the request in your wallet.");
  });

  it("reads a rejection from xBull's wording, which carries no useful code", () => {
    expect(friendlyWalletError({ code: -1, message: "Request rejected from the wallet" }))
      .toBe("You rejected the request in your wallet.");
  });

  it("treats a closed xBull window as backing out, not as an error", () => {
    // Closing the popup completes the bridge's stream empty, so rxjs's EmptyError
    // message is what parseError hands us.
    expect(readWalletError({ code: -1, message: "no elements in sequence" })).toEqual({
      message: null,
      stale: false,
    });
  });

  it("marks a wallet id the kit can no longer resolve as stale", () => {
    // `setWallet` throws a real Error here, and with the upstream typo.
    const err = new Error('Wallet id "lobstr" is not and existing module');
    expect(readWalletError(err)).toEqual({
      message: "That wallet isn't available here. Pick another one.",
      stale: true,
    });
  });

  it("marks an unset wallet as stale, but only for the kit's own -3", () => {
    expect(readWalletError({ code: -3, message: "Please set the wallet first" })).toEqual({
      message: "Connect a wallet first.",
      stale: true,
    });
  });

  it("does not confuse Albedo's -3 with the kit's -3", () => {
    // Same code, unrelated meaning — which is why the message has to decide.
    expect(readWalletError({ code: -3, message: "Intent request is invalid." })).toEqual({
      message: "Intent request is invalid.",
      stale: false,
    });
  });

  it("explains a missing Freighter and a missing Hana separately", () => {
    expect(friendlyWalletError({ code: -1, message: "Freighter is not connected" }))
      .toBe("Freighter isn't available. Install it, or unlock it and reload.");
    expect(friendlyWalletError({ code: -1, message: "Hana Wallet is not installed" }))
      .toBe("Hana Wallet isn't installed.");
  });

  it("names pop-up blocking as the cause when xBull's window never opened", () => {
    expect(
      friendlyWalletError({
        code: -1,
        message: "xBull Wallet is not open, we can't connect with it",
      }),
    ).toBe("The xBull window didn't open — allow pop-ups for this site and retry.");
  });

  it("replaces parseError's own placeholder with something actionable", () => {
    expect(friendlyWalletError({ code: -1, message: "Unhandled error from the wallet" }))
      .toBe("Your wallet couldn't complete that. Please try again.");
    expect(friendlyWalletError(undefined))
      .toBe("Your wallet couldn't complete that. Please try again.");
  });

  it("passes an unrecognised message through rather than hiding it", () => {
    // Hana's rejection wording comes from the extension and isn't published, so an
    // unknown message has to stay readable instead of being flattened to a generic.
    expect(friendlyWalletError({ code: -1, message: "Decrypted message is null" }))
      .toBe("Decrypted message is null");
  });
});
