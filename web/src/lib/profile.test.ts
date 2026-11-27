import { describe, expect, it } from "vitest";
import {
  PROFILE_PROBLEMS,
  X_MAX_LENGTH,
  evmProblem,
  evmUrl,
  normalizeHandle,
  shortEvm,
  xProblem,
  xUrl,
} from "./profile";

const ADDRESS = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";

describe("an X handle", () => {
  it("is stored without the @, however it was typed", () => {
    expect(normalizeHandle("@ada")).toBe("ada");
    expect(normalizeHandle("ada")).toBe("ada");
    expect(normalizeHandle("  @ada  ")).toBe("ada");
    // Two wallets writing it differently must not read as two people.
    expect(normalizeHandle("@ada")).toBe(normalizeHandle("ada"));
  });

  it("accepts what X itself accepts", () => {
    expect(xProblem("ada_lovelace")).toBeNull();
    expect(xProblem("@Ada99")).toBeNull();
    expect(xProblem("a".repeat(X_MAX_LENGTH))).toBeNull();
  });

  it("refuses one character past X's own limit", () => {
    expect(xProblem("a".repeat(X_MAX_LENGTH + 1))).toBe("x-too-long");
  });

  /**
   * The check that matters. This string becomes an `href` and sits next to an
   * attendance record, so the characters that make one handle render as another
   * are the whole risk — the same risk `nameProblem` exists for.
   */
  it("refuses anything that could make a handle read as a different one", () => {
    // A right-to-left override: everything after it renders reversed.
    expect(xProblem("ada‮kcatta")).toBe("x-bad-characters");
    // A zero-width space, invisible and not part of the handle it mimics.
    expect(xProblem("ada​lovelace")).toBe("x-bad-characters");
    // Cyrillic 'а', which is not the Latin 'a' beside it.
    expect(xProblem("аda")).toBe("x-bad-characters");
    // A slash would make the URL point somewhere else entirely.
    expect(xProblem("ada/../elonmusk")).toBe("x-bad-characters");
  });

  it("treats blank as clearing rather than as an error", () => {
    expect(xProblem("")).toBeNull();
    expect(xProblem("   ")).toBeNull();
    expect(xProblem("@")).toBeNull();
  });

  it("builds a link from the normalised handle", () => {
    expect(xUrl("@ada")).toBe("https://x.com/ada");
  });
});

describe("an Ethereum address", () => {
  it("accepts 0x and forty hex digits", () => {
    expect(evmProblem(ADDRESS)).toBeNull();
    expect(evmProblem(`  ${ADDRESS}  `)).toBeNull();
  });

  it("refuses anything else", () => {
    expect(evmProblem("0x123")).toBe("evm-not-an-address");
    expect(evmProblem(ADDRESS.slice(2))).toBe("evm-not-an-address"); // no 0x
    expect(evmProblem(`${ADDRESS}0`)).toBe("evm-not-an-address"); // one too many
    expect(evmProblem("0xZZZZ35Cc6634C0532925a3b844Bc454e4438f44e")).toBe(
      "evm-not-an-address",
    );
  });

  /**
   * Mixed case in an Ethereum address is EIP-55 checksum information, and this
   * field is typed by hand — which is exactly when a checksum earns its place.
   * Lowercasing it would throw away the only self-check the string carries.
   */
  it("keeps the case exactly as typed", () => {
    expect(evmProblem(ADDRESS)).toBeNull();
    expect(evmUrl(ADDRESS)).toContain("0x742d35Cc6634C0532925a3b844Bc454e4438f44e");
    expect(evmUrl(ADDRESS)).not.toContain(ADDRESS.toLowerCase());
  });

  it("shortens for display without losing the ends", () => {
    expect(shortEvm(ADDRESS)).toBe("0x742d…f44e");
    expect(shortEvm("0x1234")).toBe("0x1234");
  });

  it("treats blank as clearing", () => {
    expect(evmProblem("")).toBeNull();
    expect(evmProblem("  ")).toBeNull();
  });
});

describe("the problem messages", () => {
  it("has one for every problem the validators can return", () => {
    const returned = new Set(
      [
        xProblem("a".repeat(99)),
        xProblem("ada‮"),
        evmProblem("0xnope"),
      ].filter((p) => p !== null),
    );
    expect(returned.size).toBe(3);
    for (const problem of returned) {
      expect(PROFILE_PROBLEMS[problem]).toBeTruthy();
    }
  });
});
