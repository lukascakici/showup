import { describe, expect, it } from "vitest";
import {
  ROLL_CALLS,
  isOpen,
  newestFirst,
  readAddress,
  rollCallBySlug,
  type RollCall,
} from "./roll-call";

const A = "GBQRAWAAWGSS2G5G4BWAN3XJBGGEXYDJM66S7Z6TPULGLEDC7RE2O4PW";
const B = "GDL3H646S6HGGJTH2BBNCBDONJDN5E7L56ZRFWGCOSPXEDHOJLZOZKI5";

const call: RollCall = {
  slug: "test-call",
  title: "Test",
  opensAt: 1_000,
  closesAt: 2_000,
};

describe("the roll call window", () => {
  it("opens at the first second and closes at the last", () => {
    expect(isOpen(call, 999)).toBe(false);
    expect(isOpen(call, 1_000)).toBe(true);
    expect(isOpen(call, 1_999)).toBe(true);
    // Half-open on purpose: `closesAt` is the moment it is over, not the last
    // moment it works, so two adjacent roll calls could never both accept.
    expect(isOpen(call, 2_000)).toBe(false);
  });
});

describe("the configured roll call", () => {
  it("spans both meetup days", () => {
    const configured = rollCallBySlug("prohackathon_residency");
    expect(configured).not.toBeNull();
    // 19.09.2026 00:00 +03 through 21.09.2026 00:00 +03. Written as dates here
    // and as seconds in the source, so a typo in either one fails rather than
    // quietly shifting the door by an hour.
    expect(new Date(configured!.opensAt * 1000).toISOString()).toBe("2026-09-18T21:00:00.000Z");
    expect(new Date(configured!.closesAt * 1000).toISOString()).toBe("2026-09-20T21:00:00.000Z");
  });

  it("is reachable at the top level, and unknown paths are not", () => {
    expect(rollCallBySlug("prohackathon_residency")?.slug).toBe("prohackathon_residency");
    expect(rollCallBySlug("nope")).toBeNull();
  });

  // The route is `/[call]`, the very last thing Next matches. A slug named after
  // a real page would lose to that page and the roll call would silently never
  // load — so it is refused here instead of being debugged in a hallway.
  it("refuses a slug that shadows a real page", () => {
    for (const reserved of ["create", "e", "api"]) {
      expect(rollCallBySlug(reserved)).toBeNull();
    }
  });

  it("has no slug that needs escaping in a URL or reading aloud", () => {
    for (const { slug } of ROLL_CALLS) {
      expect(slug).toMatch(/^[a-z0-9_-]+$/);
      expect(encodeURIComponent(slug)).toBe(slug);
    }
  });
});

describe("what the door accepts", () => {
  it("takes a Stellar address, in any case, with stray spaces", () => {
    expect(readAddress({ address: A })).toBe(A);
    expect(readAddress({ address: `  ${A.toLowerCase()}  ` })).toBe(A);
  });

  it("refuses everything that is not one", () => {
    // A contract address is the near miss worth pinning: it is a valid Stellar
    // identifier, the right length, and not something a wallet can hold.
    expect(readAddress({ address: "CD5AEMRB35FBZKO24562DRITAY337CMBXGF6HVSUDRKWHE4RKQLE7FCE" })).toBeNull();
    expect(readAddress({ address: "" })).toBeNull();
    expect(readAddress({ address: 42 })).toBeNull();
    expect(readAddress({})).toBeNull();
    expect(readAddress(null)).toBeNull();
    expect(readAddress("just a string")).toBeNull();
  });
});

describe("the list", () => {
  it("puts the newest arrival first", () => {
    const sorted = newestFirst([
      { address: A, at: 100 },
      { address: B, at: 300 },
    ]);
    expect(sorted.map((e) => e.address)).toEqual([B, A]);
  });

  it("sorts an entry with no timestamp last instead of first", () => {
    // Read straight after a write, so a missing `at` is a live possibility —
    // and a zero sorting to the top would show somebody else's arrival as the
    // most recent one.
    const sorted = newestFirst([
      { address: A, at: 0 },
      { address: B, at: 300 },
    ]);
    expect(sorted.map((e) => e.address)).toEqual([B, A]);
  });

  it("does not reorder the caller's array", () => {
    const original = [
      { address: A, at: 100 },
      { address: B, at: 300 },
    ];
    newestFirst(original);
    expect(original.map((e) => e.address)).toEqual([A, B]);
  });
});
