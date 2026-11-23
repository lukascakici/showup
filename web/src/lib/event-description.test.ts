import { describe, expect, it } from "vitest";
import {
  MAX_DESCRIPTION_LENGTH,
  descriptionDocId,
  isBody,
  normalizeBody,
  toShareText,
} from "./event-description";

const FACTORY_A = "CD5AEMRB35FBZKO24562DRITAY337CMBXGF6HVSUDRKWHE4RKQLE7FCE";
const FACTORY_B = "CAI5RQZFXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXCA7JD3CW";
const EVENT = "CAYQHGRPZ7SKAESRPNJRK6RQZBDYZWYZFHGYO2LW3U5MNETV4L7KCAK5";

describe("where a description is stored", () => {
  // The bug this exists to not have: a document keyed by the contract alone
  // collides across networks, and whichever synced last wins. Found in the
  // records index on 22.11; not repeated here.
  it("keys by the factory as well as the event", () => {
    expect(descriptionDocId(FACTORY_A, EVENT)).toBe(`${FACTORY_A}_${EVENT}`);
  });

  it("gives the same event two documents on two networks", () => {
    expect(descriptionDocId(FACTORY_A, EVENT)).not.toBe(descriptionDocId(FACTORY_B, EVENT));
  });
});

describe("what counts as a body", () => {
  it("accepts ordinary text", () => {
    expect(isBody("Halı saha, Perşembe. Kramponunu getir.")).toBe(true);
  });

  it("refuses empty and whitespace-only", () => {
    // Not the same as deleting a description, and conflating them would make
    // "cleared by the organizer" and "never written" indistinguishable.
    expect(isBody("")).toBe(false);
    expect(isBody("   ")).toBe(false);
    expect(isBody("\n\n\t")).toBe(false);
  });

  it("refuses anything that isn't a string", () => {
    // These arrive from a JSON body, so the types are whatever was posted.
    for (const value of [null, undefined, 42, {}, [], true]) {
      expect(isBody(value)).toBe(false);
    }
  });

  it("measures the trimmed length, at the boundary", () => {
    expect(isBody("a".repeat(MAX_DESCRIPTION_LENGTH))).toBe(true);
    expect(isBody("a".repeat(MAX_DESCRIPTION_LENGTH + 1))).toBe(false);
    // Padding does not buy room, and does not cost any either.
    expect(isBody(`  ${"a".repeat(MAX_DESCRIPTION_LENGTH)}  `)).toBe(true);
  });
});

describe("normalizing a body", () => {
  it("trims the ends and leaves the middle alone", () => {
    expect(normalizeBody("  two\n\nparagraphs  ")).toBe("two\n\nparagraphs");
  });

  it("makes Windows and Mac newlines the same string", () => {
    // Otherwise an edit that changed nothing but the line endings would land in
    // the history as a real revision.
    expect(normalizeBody("a\r\nb\rc")).toBe("a\nb\nc");
    expect(normalizeBody("a\r\nb")).toBe(normalizeBody("a\nb"));
  });

  it("does not strip markup, because none is ever rendered", () => {
    // Stored as text, displayed as text. Sanitising here would imply the output
    // is markup somewhere, which is the assumption that becomes an XSS hole.
    const hostile = '<script>alert(1)</script>';
    expect(normalizeBody(hostile)).toBe(hostile);
  });
});

describe("the share card's one line", () => {
  it("passes short text through, newlines collapsed", () => {
    expect(toShareText("Halı saha\n\nPerşembe")).toBe("Halı saha Perşembe");
  });

  it("cuts long text at a word boundary", () => {
    const body = "kelime ".repeat(40);
    const share = toShareText(body);
    expect(share.length).toBeLessThanOrEqual(161); // 160 plus the ellipsis
    expect(share.endsWith("…")).toBe(true);
    expect(share).not.toMatch(/keli…$/); // not mid-word
  });

  it("still cuts when there is no boundary to cut at", () => {
    const share = toShareText("a".repeat(500));
    expect(share).toBe(`${"a".repeat(160)}…`);
  });
});
