import { describe, expect, it } from "vitest";
import { formatXlm, isValidAddress, isValidAmount, shortAddr } from "./format";

// A real Testnet account (the factory deployer), so the length is honest.
const ADDRESS = "GDL3H646S6HGGJTH2BBNCBDONJDN5E7L56ZRFWGCOSPXEDHOJLZOZKI5";

describe("shortAddr", () => {
  it("keeps the head and tail around an ellipsis", () => {
    expect(shortAddr(ADDRESS)).toBe("GDL3…ZKI5");
    expect(shortAddr(ADDRESS, 6, 6)).toBe("GDL3H6…ZOZKI5");
  });

  it("returns short input untouched rather than mangling it", () => {
    expect(shortAddr("GABCDEFGH")).toBe("GABCDEFGH");
    expect(shortAddr("")).toBe("");
  });
});

describe("formatXlm", () => {
  it("groups thousands and trims to the requested precision", () => {
    expect(formatXlm("1234.5")).toBe("1,234.5");
    expect(formatXlm("10000")).toBe("10,000");
    expect(formatXlm("1234.56789", 2)).toBe("1,234.57");
  });

  it("falls back to 0 for anything unparseable", () => {
    expect(formatXlm("abc")).toBe("0");
    expect(formatXlm("")).toBe("0");
  });
});

describe("isValidAddress", () => {
  it("accepts a 56-character G address, trimmed", () => {
    expect(isValidAddress(ADDRESS)).toBe(true);
    expect(isValidAddress(`  ${ADDRESS}  `)).toBe(true);
  });

  it("rejects wrong length, wrong prefix and lowercase", () => {
    expect(isValidAddress(ADDRESS.slice(0, 55))).toBe(false);
    expect(isValidAddress(`C${ADDRESS.slice(1)}`)).toBe(false);
    expect(isValidAddress(ADDRESS.toLowerCase())).toBe(false);
    expect(isValidAddress("")).toBe(false);
  });
});

describe("isValidAmount", () => {
  it("accepts positive amounts within Stellar's 7 decimal places", () => {
    expect(isValidAmount("10")).toBe(true);
    expect(isValidAmount(" 5 ")).toBe(true);
    expect(isValidAmount("0.0000001")).toBe(true);
  });

  it("rejects zero, negatives and more precision than the ledger holds", () => {
    expect(isValidAmount("0")).toBe(false);
    expect(isValidAmount("-1")).toBe(false);
    expect(isValidAmount("10.12345678")).toBe(false);
    expect(isValidAmount("")).toBe(false);
    expect(isValidAmount("abc")).toBe(false);
  });
});
