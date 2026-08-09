import { describe, expect, it } from "vitest";
import {
  formatWhen,
  formatXlm,
  isValidAddress,
  isValidAmount,
  shortAddr,
  shortHash,
} from "./format";

// A real Testnet account (the factory deployer), so the length is honest.
const ADDRESS = "GDL3H646S6HGGJTH2BBNCBDONJDN5E7L56ZRFWGCOSPXEDHOJLZOZKI5";

// A real Testnet transaction hash — 64 hex characters, the length the UI has to
// fit into an activity row without losing the ability to identify it.
const TX_HASH = "4b8c1e0a3d5f27916e0b4c8a1f3d6e97205c8b4a1e7d3f60925a8c4b1e6d3f09";

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

describe("shortHash", () => {
  it("keeps enough of a transaction hash to tell two apart", () => {
    expect(shortHash(TX_HASH)).toBe("4b8c1e0a…1e6d3f09");
  });

  // Sixteen hex characters is 64 bits. Four would not be: activity rows are
  // read as evidence against docs/deployments.md, and a prefix short enough to
  // collide would have someone confirming the wrong transaction.
  it("shows sixteen of the hash's characters", () => {
    const shown = shortHash(TX_HASH).replace("…", "");
    expect(shown).toHaveLength(16);
  });
});

describe("formatWhen", () => {
  // Events created before start times existed store 0. The failure this guards
  // is rendering them as "Thu, 1 Jan, 02:00" — a date at the epoch looks like a
  // real date, and nothing on screen would say it was never set.
  it("says there is no date rather than showing the epoch", () => {
    expect(formatWhen(0)).toBe("No date");
  });

  it("reads the value as seconds, in the reader's own timezone", () => {
    const when = new Date("2026-08-20T19:00:00Z");
    const seconds = Math.floor(when.getTime() / 1000);
    // Built from the same Date rather than hardcoded, so the assertion holds in
    // any timezone or locale CI runs in. What it pins is the conversion: seconds
    // read as milliseconds would land in January 1970 and still format fine.
    expect(formatWhen(seconds)).toBe(
      when.toLocaleString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  });

  it("distinguishes times on the same day", () => {
    const noon = Math.floor(new Date("2026-08-20T12:00:00Z").getTime() / 1000);
    expect(formatWhen(noon)).not.toBe(formatWhen(noon + 3 * 3600));
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
