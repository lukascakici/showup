import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityFeed } from "./ActivityFeed";
import type { Activity } from "@/lib/events";

/**
 * The three states this component used to render identically.
 *
 * It took only `activity` once, so **"Nothing yet."** meant the feed was still
 * loading, *and* that the event genuinely had no history, *and* that the RPC
 * had failed outright. These are the tests that stop that coming back — and
 * they are exactly the states that are painful to reach by hand, since two of
 * them need the network to misbehave on cue.
 */
const RESERVED: Activity = {
  kind: "reserved",
  txHash: "a".repeat(64),
  ledger: 1,
  at: Date.parse("2026-08-23T18:14:00Z"),
  guest: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJK",
  spotsLeft: 4,
};

describe("ActivityFeed", () => {
  it("does not claim an empty history while it is still loading", () => {
    render(<ActivityFeed activity={[]} loading />);
    expect(screen.queryByText(/nothing yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: /loading activity/i })).toBeInTheDocument();
  });

  it("does not claim an empty history when the read failed", () => {
    render(<ActivityFeed activity={[]} error="rpc exploded" />);
    expect(screen.queryByText(/nothing yet/i)).not.toBeInTheDocument();
    expect(screen.getByText(/couldn't read this contract's events/i)).toBeInTheDocument();
  });

  it("says the event itself is fine when only the feed broke", () => {
    render(<ActivityFeed activity={[]} error="rpc exploded" />);
    expect(screen.getByText(/this is the history feed, not the money/i)).toBeInTheDocument();
  });

  it("offers a retry that calls back", async () => {
    const onRetry = vi.fn();
    render(<ActivityFeed activity={[]} error="rpc exploded" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("says nothing yet only when it really is nothing yet", () => {
    render(<ActivityFeed activity={[]} />);
    expect(screen.getByText(/nothing yet/i)).toBeInTheDocument();
  });

  // A row is a piece of evidence someone has to check on Stellar Expert, so the
  // hash has to be readable off the screen and openable from it.
  it("links each row to its transaction, not to its ledger", () => {
    render(<ActivityFeed activity={[RESERVED]} />);
    const link = screen.getByRole("link", { name: /a{8}…a{8}/i });
    expect(link).toHaveAttribute("href", expect.stringContaining(RESERVED.txHash));
    expect(link).toHaveAttribute("title", RESERVED.txHash);
  });

  // A feed that stopped early is indistinguishable from a quiet event unless it
  // admits it — and it must only admit it when there is something to admit.
  it("admits truncation only alongside real rows", () => {
    const { rerender } = render(<ActivityFeed activity={[RESERVED]} truncated />);
    expect(screen.getByText(/older activity isn't shown/i)).toBeInTheDocument();

    rerender(<ActivityFeed activity={[]} truncated />);
    expect(screen.queryByText(/older activity isn't shown/i)).not.toBeInTheDocument();
  });

  // Failing to refresh is a different fact from failing to load: the rows on
  // screen are still true, they have just stopped moving.
  it("keeps showing rows when a refresh fails, and says they may be stale", () => {
    render(<ActivityFeed activity={[RESERVED]} error="rpc exploded" />);
    expect(screen.getByText(/reserved a spot/i)).toBeInTheDocument();
    expect(screen.getByText(/may be missing the last few moments/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });
});
