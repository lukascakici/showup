import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { NetworkProvider } from "./network-context";
import { network, type NetworkId } from "./networks";
import { useSigner } from "./signer";

/**
 * The signer carries the network, and this is the test that it does.
 *
 * Every contract client in the app is built from this object. `ClientOpts`
 * defaults a missing `network` to `defaultNetwork()`, which answers "mainnet"
 * wherever Mainnet is configured — including on the Testnet host, because one
 * build serves both and Mainnet's RPC path is compiled into it. So an omitted
 * network here does not fail; it quietly points a write at the wrong chain.
 *
 * The read paths were given a network when Mainnet went live and the write paths
 * were not, and nothing caught it for a week: a read on the wrong chain renders
 * an empty page, and a write on the wrong chain is silent until somebody acts.
 * Hence a test at the one place that decides for all of them.
 */

const wallet = vi.hoisted(() => ({
  value: { address: "GABC" as string | null, sign: vi.fn() },
}));

vi.mock("./wallet", () => ({ useWallet: () => wallet.value }));

beforeEach(() => {
  wallet.value = { address: "GABC", sign: vi.fn() };
});

const signerOn = (id: NetworkId) =>
  renderHook(() => useSigner(), {
    wrapper: ({ children }) => <NetworkProvider id={id}>{children}</NetworkProvider>,
  }).result.current;

describe("the network the signer hands to a contract client", () => {
  it("is the one being served, on each host", () => {
    expect(signerOn("testnet").network.id).toBe("testnet");
    expect(signerOn("mainnet").network.id).toBe("mainnet");
  });

  /**
   * Named explicitly rather than compared to `defaultNetwork()`: the whole point
   * is that the default is not what a write should use, so a test written in
   * terms of the default would pass while the bug was present.
   */
  it("points a Testnet write at Testnet's own factory and RPC", () => {
    const { network: on } = signerOn("testnet");
    expect(on.contracts?.factoryId).toBe(network("testnet").contracts?.factoryId);
    expect(on.sorobanRpcUrl).toBe("https://soroban-testnet.stellar.org");
    expect(on.passphrase).toBe(network("testnet").passphrase);
  });

  /**
   * The deposit asset is a hash of the asset and the network passphrase, so the
   * two chains genuinely differ — and a Testnet event created with Mainnet's
   * value points its deposits at a contract that is not there.
   */
  it("gives each network its own native asset contract", () => {
    expect(signerOn("testnet").network.nativeSac).not.toBe(
      signerOn("mainnet").network.nativeSac,
    );
    expect(signerOn("testnet").network.nativeSac).toBe(network("testnet").nativeSac);
  });

  it("still carries the network with no wallet connected", () => {
    // A disconnected signer is what gates the forms, and it is also what the
    // page simulates reads with — so it needs the network just as much.
    wallet.value = { address: null, sign: vi.fn() };
    const result = signerOn("testnet");
    expect(result.publicKey).toBeUndefined();
    expect(result.network.id).toBe("testnet");
  });
});
