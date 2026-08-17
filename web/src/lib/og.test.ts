import { describe, expect, it } from "vitest";
import { eventPreview, FALLBACK_PREVIEW, SITE_NAME, UNTITLED } from "./og";
import type { EventState } from "./chain";

/**
 * The preview is read by people who have not opened the page yet, so a wrong
 * one is worse than none: it is the only thing standing between a group-chat
 * link and someone deciding it looks like a scam.
 */
const G = (n: number) => Array.from({ length: n }, (_, i) => `G${i}`);

const base: EventState = {
  id: "CCWYYTY5XCJY7KFPUWKMP4MELJG3G3FIYW2O3WJSMEIZTDKOMST6FL7C",
  title: "Perşembe halı saha",
  startsAt: 1_755_000_000,
  organizer: "GORGANIZER",
  deposit: 100_000_000n, // 10 XLM
  feeAllowance: 1_000_000n,
  capacity: 10,
  policy: { tag: "SplitAmongAttendees", values: undefined } as EventState["policy"],
  reserved: [],
  checkedIn: [],
  phase: "Reserving",
};

const at = (over: Partial<EventState>): EventState => ({ ...base, ...over });

describe("eventPreview", () => {
  it("leads with the event's own name", () => {
    expect(eventPreview(base).title).toBe(`Perşembe halı saha · ${SITE_NAME}`);
  });

  // Events created before the title revision have no title on-chain at all.
  // They are real events holding real deposits, so they get a preview, not a
  // blank one that reads as a broken page.
  it("names an untitled event rather than shipping a bare separator", () => {
    expect(eventPreview(at({ title: "" })).title).toBe(`${UNTITLED} · ${SITE_NAME}`);
    expect(eventPreview(at({ title: "   " })).title).toBe(`${UNTITLED} · ${SITE_NAME}`);
  });

  it("always states the deposit, in XLM", () => {
    for (const phase of ["Reserving", "CheckingIn", "Finalized"] as const) {
      expect(eventPreview(at({ phase })).description).toContain("10 XLM deposit");
    }
  });

  it("counts the remaining spots while reserving is open", () => {
    const p = eventPreview(at({ reserved: G(7) }));
    expect(p.description).toContain("3 of 10 spots left");
  });

  it("says spot, not spots, for the last one", () => {
    const p = eventPreview(at({ reserved: G(9) }));
    expect(p.description).toContain("1 of 10 spot left");
  });

  // The invite is still worth previewing when it is full — someone is deciding
  // whether to bother opening it — but it must not invite a reservation that
  // the contract would reject.
  it("does not invite a reservation into a full event", () => {
    const p = eventPreview(at({ reserved: G(10) }));
    expect(p.description).toContain("full");
    expect(p.description).not.toMatch(/reserve yours/i);
  });

  it("does not invite a reservation once check-in has opened", () => {
    const p = eventPreview(at({ phase: "CheckingIn", reserved: G(4) }));
    expect(p.description).toContain("check-in is open");
    expect(p.description).not.toMatch(/spots left/i);
    expect(p.description).not.toMatch(/reserve yours/i);
  });

  it("reports a finalized event in the past tense, with the real count", () => {
    const p = eventPreview(at({ phase: "Finalized", reserved: G(10), checkedIn: G(8) }));
    expect(p.description).toContain("8 of 10 showed up");
    expect(p.description).not.toMatch(/reserve yours/i);
  });

  /**
   * This string is built on a UTC server and read by guests in UTC+3, while the
   * page underneath formats the same timestamp in the reader's own zone. A
   * clock time here would contradict the page for every Turkish guest, so
   * `startsAt` is deliberately never rendered.
   */
  it("never puts a date or a time in the preview", () => {
    for (const phase of ["Reserving", "CheckingIn", "Finalized"] as const) {
      const d = eventPreview(at({ phase })).description;
      expect(d).not.toMatch(/\d{1,2}:\d{2}/);
      expect(d).not.toMatch(/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i);
    }
  });

  // The address is the one thing a guest cannot verify by eye, and repeating it
  // in the preview is what makes a link look machine-generated.
  it("keeps the contract address out of the preview", () => {
    const p = eventPreview(base);
    expect(p.title).not.toContain(base.id);
    expect(p.description).not.toContain(base.id);
  });
});

describe("FALLBACK_PREVIEW", () => {
  // `generateMetadata` gets one shot at a read that can fail because RPC is
  // slow, not because the event is missing. The page underneath retries and can
  // tell those apart; the preview cannot, so it must not guess.
  it("claims nothing about whether the event exists", () => {
    expect(FALLBACK_PREVIEW.title).not.toMatch(/not found|missing|no event/i);
    expect(FALLBACK_PREVIEW.description).not.toMatch(/not found|missing|no event/i);
  });

  it("still identifies the site", () => {
    expect(FALLBACK_PREVIEW.title).toContain(SITE_NAME);
  });
});
