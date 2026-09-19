import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ROLL_CALLS } from "@/lib/roll-call";
import { LiveRollCall, openRollCall } from "./LiveRollCall";

/**
 * This card is the only thing on the home page the server renders as nothing.
 *
 * Its server snapshot is `null` on purpose, because the clock is read in the
 * browser: a build that straddles the window cannot ship HTML the visitor's own
 * time disagrees with. The cost of that choice is that "did it ever appear?" is a
 * question no page fetch can answer, and a `useSyncExternalStore` that quietly
 * stayed on its server snapshot would look exactly like an empty home page.
 * So it gets asserted here instead.
 */
const call = ROLL_CALLS[0];
const during = (call.opensAt + 60) * 1000;

afterEach(() => vi.useRealTimers());

describe("the live roll call card", () => {
  it("shows the open roll call, linked at the top level", () => {
    vi.useFakeTimers({ now: during });
    render(<LiveRollCall />);

    const link = screen.getByRole("link", { name: /Happening now/i });
    expect(link).toHaveAttribute("href", `/${call.slug}`);
    expect(link).toHaveTextContent(call.title);
  });

  it("is gone before it opens and after it closes", () => {
    for (const now of [(call.opensAt - 1) * 1000, call.closesAt * 1000]) {
      vi.useFakeTimers({ now });
      const { unmount } = render(<LiveRollCall />);
      expect(screen.queryByRole("link")).toBeNull();
      unmount();
    }
  });
});

describe("the snapshot itself", () => {
  it("returns the identical object every read", () => {
    // `useSyncExternalStore` compares snapshots with Object.is and re-renders
    // until they settle, so a fresh object per read is an infinite loop rather
    // than a slow render. Pinned here rather than trusted to stay true.
    expect(openRollCall(during)).toBe(openRollCall(during));
  });
});
