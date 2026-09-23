import { describe, expect, it } from "vitest";
import { hiddenIds, isHidden } from "./listing";

/**
 * Hiding is the only thing in this app that is decided off-chain, so the way it
 * fails matters more than the way it works.
 *
 * The failure to design against is an event disappearing that nobody meant to
 * hide. `hidden` is typed by a person into a web console, where a boolean and
 * the string "false" look identical in a form field, so anything that is not
 * exactly `true` has to read as visible.
 */
const at = (over: { id: string; hidden?: unknown }) => over as { id: string; hidden?: boolean };

describe("what counts as hidden", () => {
  it("takes only a real boolean true", () => {
    expect(isHidden(at({ id: "A", hidden: true }))).toBe(true);
  });

  it("leaves an event visible for everything else somebody might type", () => {
    // Every one of these is a plausible thing to end up in a Firestore field,
    // and every one of them must show the event rather than swallow it.
    for (const hidden of [false, undefined, null, 0, 1, "true", "false", "", []]) {
      expect(isHidden(at({ id: "A", hidden }))).toBe(false);
    }
  });

  it("is visible when the document has no such field at all", () => {
    // Every document written before this feature existed.
    expect(isHidden({ hidden: undefined })).toBe(false);
  });
});

describe("the hidden set", () => {
  it("collects exactly the ids marked true", () => {
    const set = hiddenIds([
      at({ id: "A", hidden: true }),
      at({ id: "B" }),
      at({ id: "C", hidden: false }),
      at({ id: "D", hidden: true }),
    ]);
    expect([...set].sort()).toEqual(["A", "D"]);
  });

  it("is empty when the index is empty", () => {
    // The index being off, or never written, must not hide anything: the list
    // would go blank the first time Firestore was unreachable.
    expect(hiddenIds([]).size).toBe(0);
  });
});
