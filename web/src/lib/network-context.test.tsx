import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NetworkProvider, useNetwork } from "./network-context";

/**
 * `WalletProvider` reads this context, and every component test mocks
 * `@/lib/wallet` away — so the provider is never mounted in a test and this is
 * the only place the contract is checked at all.
 *
 * What is worth checking is the failure: a component reading the network
 * without the provider above it must break loudly at the boundary rather than
 * quietly fall back to a network nobody chose.
 */
function Probe() {
  const network = useNetwork();
  return (
    <span>
      {network.id}:{network.label}:{String(network.isRealMoney)}
    </span>
  );
}

describe("useNetwork", () => {
  it("gives the network the provider was told to serve", () => {
    render(
      <NetworkProvider id="testnet">
        <Probe />
      </NetworkProvider>,
    );
    expect(screen.getByText("testnet:Testnet:false")).toBeTruthy();
  });

  it("resolves the id to the full network, so only an id crosses the boundary", () => {
    render(
      <NetworkProvider id="mainnet">
        <Probe />
      </NetworkProvider>,
    );
    // Proves the provider rebuilds the object from `networks.ts` rather than
    // carrying a serialized copy that could drift from it.
    expect(screen.getByText("mainnet:Mainnet:true")).toBeTruthy();
  });

  it("throws outside a provider instead of assuming a network", () => {
    // React logs the thrown error through its own error handling; silenced so
    // the failure under test doesn't look like a broken test run.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => render(<Probe />)).toThrow(/NetworkProvider/);
    } finally {
      error.mockRestore();
    }
  });
});
